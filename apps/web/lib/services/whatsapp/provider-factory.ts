import { type WhatsAppOtpProvider } from './types';
import { MockWhatsAppOtpProvider } from './MockWhatsAppOtpProvider';
import { CloudWhatsAppOtpProvider } from './CloudWhatsAppOtpProvider';

export class OtpNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpNotConfiguredError';
  }
}

let instance: WhatsAppOtpProvider | null = null;

/**
 * Returns the active WhatsApp OTP provider, chosen from SERVER env only.
 *
 *   WHATSAPP_OTP_MODE=mock                 -> MockWhatsAppOtpProvider (code returned to the
 *                                             client; phone ownership is NOT verified)
 *   WHATSAPP_OTP_MODE=production | cloud   -> CloudWhatsAppOtpProvider (WhatsApp Cloud API)
 *   unset                                  -> mock outside production, FAIL CLOSED in production
 *
 * Failing closed in production means mock (unverified) login is something a
 * deploy opts into explicitly, never an accident of a missing variable.
 * Routes and the UI are identical regardless of provider.
 */
export function getWhatsAppOtpProvider(): WhatsAppOtpProvider {
  const mode = (process.env.WHATSAPP_OTP_MODE || '').trim().toLowerCase();

  if (mode === 'production' || mode === 'cloud') {
    if (!instance || instance.mode !== 'production') instance = new CloudWhatsAppOtpProvider();
    return instance;
  }

  if (mode === 'mock' || (mode === '' && process.env.NODE_ENV !== 'production')) {
    if (!instance || instance.mode !== 'mock') instance = new MockWhatsAppOtpProvider();
    return instance;
  }

  throw new OtpNotConfiguredError(
    mode === ''
      ? 'WHATSAPP_OTP_MODE is not set (expected "mock" or "production")'
      : `Unknown WHATSAPP_OTP_MODE "${mode}" (expected "mock" or "production")`
  );
}

/**
 * Resets the active provider instance (useful for testing provider switching).
 */
export function resetWhatsAppOtpProvider(): void {
  instance = null;
}
