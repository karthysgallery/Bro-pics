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
  OTP_CONFIG,
} from './otp-store';

export class CloudWhatsAppOtpProvider implements WhatsAppOtpProvider {
  readonly mode = 'production' as const;

  private getCredentials() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'karthys_auth_otp';

    if (!accessToken || !phoneNumberId) {
      throw new Error('WhatsApp Cloud API configuration is missing server-side credentials.');
    }

    return { accessToken, phoneNumberId, templateName };
  }

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

      // Generate cryptographically random 6-digit OTP
      const otp = generateSecureOtp();

      // Store hashed OTP in server-side session store
      await OtpStore.createSession(normalized, otp, purpose);

      const { accessToken, phoneNumberId, templateName } = this.getCredentials();

      // WhatsApp Cloud API expects recipient without leading "+" (e.g. "919876543210")
      const recipient = normalized.replace(/^\+/, '');

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: otp,
                },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: otp,
                },
              ],
            },
          ],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[CloudWhatsAppOtpProvider] WhatsApp Cloud API error:', errorData?.error?.message || response.statusText);
        return {
          success: false,
          error: "We couldn't send the WhatsApp code right now. Please try again.",
          expiresInSeconds: 0,
          cooldownSeconds: 0,
        };
      }

      const responseData = await response.json();
      const messageId = responseData?.messages?.[0]?.id || `wa_${Date.now()}`;

      return {
        success: true,
        messageId,
        expiresInSeconds: OTP_CONFIG.EXPIRY_SECONDS,
        cooldownSeconds: OTP_CONFIG.COOLDOWN_SECONDS,
        // In production, devOtp is NEVER populated
        devOtp: undefined,
      };
    } catch (err: any) {
      console.error('[CloudWhatsAppOtpProvider] Delivery failure:', err?.message);
      return {
        success: false,
        error: "We couldn't send the WhatsApp code right now. Please try again.",
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
        devOtp: undefined,
        expiresInSeconds: sendResult.expiresInSeconds,
        cooldownSeconds: sendResult.cooldownSeconds,
      };
    } catch (err: any) {
      return {
        success: false,
        error: "We couldn't send the WhatsApp code right now. Please try again.",
        expiresInSeconds: 0,
        cooldownSeconds: 0,
      };
    }
  }
}
