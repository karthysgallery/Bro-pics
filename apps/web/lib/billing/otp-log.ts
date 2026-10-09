import 'server-only';
import { whatsappService } from './server';

/**
 * Records an OTP send in the WhatsApp message log (never the code). Fire and
 * forget: a logging problem must never stop a customer signing in. A
 * cooldown refusal (nothing was sent) is not logged.
 */
export function logOtpSend(to: string, result: { success: boolean; messageId?: string; error?: string; cooldownSeconds?: number }): void {
  if (!result.success && /^Please wait/i.test(result.error ?? '')) return;
  try {
    void whatsappService()
      .logOtp({ to, ok: result.success, providerMessageId: result.messageId ?? null, error: result.error ?? null })
      .catch(() => undefined);
  } catch {
    // no database in this environment (e.g. a unit test): nothing to log
  }
}
