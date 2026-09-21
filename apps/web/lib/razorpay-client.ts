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
}

export interface RazorpayRefund {
  id: string;
  status: string;
}

/**
 * Real money movement — same pattern as createRazorpayOrder (Basic auth
 * over the REST API, no SDK dependency). Called from the staff returns
 * route when a return is advanced to refund_processing/refunded, never
 * from anywhere client-reachable. Razorpay refunds are themselves
 * idempotent per payment when a caller supplies its own idempotency key,
 * but this app doesn't yet — see the backend notes doc for that gap
 * (a retried request could double-refund; the staff route mitigates this
 * today only by checking the return's current status before calling).
 */
export async function createRazorpayRefund(params: CreateRazorpayRefundParams): Promise<RazorpayRefund> {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    body: JSON.stringify({ amount: params.amount, ...(params.notes && { notes: params.notes }) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay refund failed (${response.status}): ${text}`);
  }

  return (await response.json()) as RazorpayRefund;
}
