import {
  type WhatsAppOtpProvider,
  type SendOtpOptions,
  type SendOtpResult,
  type VerifyOtpResult,
  type ResendOtpResult,
} from './types';
import {
  OtpStore,
  generateSecureOtp,
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
  OTP_CONFIG,
} from './otp-store';

export class MockWhatsAppOtpProvider implements WhatsAppOtpProvider {
  readonly mode = 'mock' as const;

  async sendOtp({ phoneNumber, purpose = 'login' }: SendOtpOptions): Promise<SendOtpResult> {
    try {
      const normalized = normalizeIndianPhoneNumber(phoneNumber);
      const cooldownCheck = await OtpStore.checkCooldown(normalized);

      if (!cooldownCheck.canResend) {
        return {
          success: false,
          error: `Please wait ${cooldownCheck.remainingSeconds} seconds before requesting a new code.`,
          expiresInSeconds: OTP_CONFIG.EXPIRY_SECONDS,
          cooldownSeconds: cooldownCheck.remainingSeconds,
        };
      }

      // Generate cryptographically random 6-digit OTP (never hardcoded)
      const otp = generateSecureOtp();

      // Store hashed OTP in server-side session store
      await OtpStore.createSession(normalized, otp, purpose);

      // The code is never logged in production (logs are not a delivery channel).
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MockWhatsAppOtpProvider] WhatsApp OTP for ${maskPhoneNumber(normalized)}: [${otp}] (purpose: ${purpose})`);
      }

      return {
        success: true,
        messageId: `mock_wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        expiresInSeconds: OTP_CONFIG.EXPIRY_SECONDS,
        cooldownSeconds: OTP_CONFIG.COOLDOWN_SECONDS,
        // Mock mode has no delivery channel, so the code is returned to the
        // client (the sign-in UI shows it in a clearly labelled demo banner).
        // This is deliberate and only reachable when WHATSAPP_OTP_MODE=mock is
        // set explicitly — see provider-factory.ts. It means phone ownership
        // is NOT verified while mock mode is on.
        devOtp: otp,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Please enter a valid WhatsApp mobile number.',
        expiresInSeconds: 0,
        cooldownSeconds: 0,
      };
    }
  }

  async verifyOtp(phoneNumber: string, otp: string): Promise<VerifyOtpResult> {
    return OtpStore.verify(phoneNumber, otp);
  }

  async resendOtp({ phoneNumber, purpose = 'login' }: SendOtpOptions): Promise<ResendOtpResult> {
    try {
      const normalized = normalizeIndianPhoneNumber(phoneNumber);
      const session = await OtpStore.getSession(normalized);

      if (session && session.resendCount >= OTP_CONFIG.MAX_RESENDS) {
        return {
          success: false,
          error: 'Maximum resend limit reached. Please wait a few minutes before trying again.',
          code: 'MAX_RESENDS_EXCEEDED',
          expiresInSeconds: 0,
          cooldownSeconds: 60,
        };
      }

      const sendResult = await this.sendOtp({ phoneNumber: normalized, purpose });
      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error,
          code: 'COOLDOWN_ACTIVE',
          expiresInSeconds: sendResult.expiresInSeconds,
          cooldownSeconds: sendResult.cooldownSeconds,
        };
      }

      return {
        success: true,
        devOtp: sendResult.devOtp,
        expiresInSeconds: sendResult.expiresInSeconds,
        cooldownSeconds: sendResult.cooldownSeconds,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "We couldn't send the WhatsApp code right now. Please try again.",
        expiresInSeconds: 0,
        cooldownSeconds: 0,
      };
    }
  }
}
