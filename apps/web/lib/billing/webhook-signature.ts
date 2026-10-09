import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta's X-Hub-Signature-256: HMAC-SHA256 of the raw body with the app secret. */
export function validSignature(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
