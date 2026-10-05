// Server-only by construction: razorpay-client.ts (imported below) is `server-only`.
import { createRazorpayRefund } from '../razorpay-client';

export interface RefundRequest {
  /** The provider's payment id recorded on the order at settlement. */
  paymentId: string;
  /** Paise. */
  amount: number;
  notes?: Record<string, string>;
  /** Stable per refund attempt — makes a concurrent/retried call resolve to the same refund. */
  idempotencyKey?: string;
}

export interface RefundOutcome {
  id: string;
  /** 'processed' = money has moved (or, for mock, been "returned"); anything else is still pending at the gateway. */
  status: string;
}

/**
 * Refunds a payment through the provider that TOOK it — read from the order
 * itself, never from current server config. An order paid through the mock
 * provider has no real payment to reverse, so it settles locally and
 * instantly; an order paid through Razorpay (or a legacy order with no
 * provider recorded, which can only have been Razorpay) goes to the gateway.
 * Switching PAYMENT_PROVIDER later therefore can't strand or mis-route refunds.
 */
export async function refundPayment(
  order: { paymentProvider?: 'mock' | 'razorpay' },
  request: RefundRequest
): Promise<RefundOutcome> {
  if (order.paymentProvider === 'mock') {
    return { id: `rfnd_mock_${request.idempotencyKey ?? request.paymentId}`, status: 'processed' };
  }
  const result = await createRazorpayRefund(request);
  return { id: result.id, status: result.status };
}
