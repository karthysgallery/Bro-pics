import 'server-only';

export interface CreateRazorpayOrderParams {
  amount: number;
  currency: string;
  receipt: string;
}

export interface RazorpayOrder {
  id: string;
}

function getAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export async function createRazorpayOrder(params: CreateRazorpayOrderParams): Promise<RazorpayOrder> {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${text}`);
  }

  return (await response.json()) as RazorpayOrder;
}

export interface CreateRazorpayRefundParams {
  paymentId: string;
  amount: number;
  notes?: Record<string, string>;
  // [ABE-23] Closes the gap this doc comment used to describe. Razorpay
  // accepts a caller-supplied `X-Razorpay-Idempotency-Key` request header
  // on refund creation (same mechanism most payment APIs use for safe
  // retries): a second call with the same key against the same payment
  // returns the original refund instead of creating a new one, at
  // Razorpay's end — a real safety net for the genuinely-concurrent-
  // requests race this file's own comment (and the staff returns route's)
  // already documented as unclosed by app-level Idempotency-Key caching
  // alone. Every caller should pass one derived from something stable and
  // unique to the refund attempt (a Firestore refund-doc id is ideal).
  idempotencyKey?: string;
}

export interface RazorpayRefund {
  id: string;
  status: string;
}

/**
 * Real money movement — same pattern as createRazorpayOrder (Basic auth
 * over the REST API, no SDK dependency). Called from the staff returns
 * route when a return is advanced to refund_processing/refunded, and from
 * the admin ad-hoc refunds route, never from anywhere client-reachable.
 */
export async function createRazorpayRefund(params: CreateRazorpayRefundParams): Promise<RazorpayRefund> {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
      ...(params.idempotencyKey && { 'X-Razorpay-Idempotency-Key': params.idempotencyKey }),
    },
    body: JSON.stringify({ amount: params.amount, ...(params.notes && { notes: params.notes }) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay refund failed (${response.status}): ${text}`);
  }

  return (await response.json()) as RazorpayRefund;
}
