import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay Checkout's success callback signature:
 * HMAC-SHA256 of "<order_id>|<payment_id>" with the account's key secret.
 * Constant-time comparison; any malformed input is simply "not valid".
 */
export function isValidCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  if (!params.razorpayOrderId || !params.razorpayPaymentId || !params.signature || !params.keySecret) return false;
  const expected = createHmac('sha256', params.keySecret).update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`).digest('hex');
  const given = Buffer.from(params.signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
