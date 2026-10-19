import { defineSecret, defineString } from 'firebase-functions/params';
import { transportFromEnv, type WhatsAppTransport } from '@bro-pics/shared/src/whatsapp/service';

/**
 * WhatsApp settings shared by every function that messages customers (order updates, invoices, credit notes, campaigns).
 * Fail-closed: the mode is `disabled` until WHATSAPP_MODE=cloud is set in functions/.env.<project>; the access token is
 * read from Secret Manager only at run time and only in cloud mode.
 */
export const waMode = defineString('WHATSAPP_MODE', { default: 'disabled' });
export const waPhoneNumberId = defineString('WHATSAPP_PHONE_NUMBER_ID', { default: '' });
/** Comma-separated numbers. While set, order messages go ONLY to these (testing). Empty = every customer. */
export const waTestRecipients = defineString('WHATSAPP_TEST_RECIPIENTS', { default: '' });
export const waAccessToken = defineSecret('whatsapp-access-token');

export function waTransport(): WhatsAppTransport {
  const mode = waMode.value();
  const env: Record<string, string | undefined> = { WHATSAPP_MODE: mode, WHATSAPP_PHONE_NUMBER_ID: waPhoneNumberId.value() };
  if (mode === 'cloud') env.WHATSAPP_ACCESS_TOKEN = waAccessToken.value();
  return transportFromEnv(env);
}

export const testRecipients = (): string[] => waTestRecipients.value().split(',').map((p) => p.trim()).filter(Boolean);
