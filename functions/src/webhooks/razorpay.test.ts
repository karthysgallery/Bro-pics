import { describe, it, expect, vi } from 'vitest';
import { handlePaymentCaptured, handlePaymentFailed } from './razorpay';
import type { PaymentEventTransaction } from './razorpay';
import type { WebhookTransaction } from './idempotency';

function makeWebhookTx(alreadyProcessed: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists: alreadyProcessed }),
    set: vi.fn(),
  };
}

function makePaymentTx(order: { id: string; userId: string } | null): PaymentEventTransaction {
  return {
    findOrderByRazorpayOrderId: vi.fn().mockResolvedValue(order),
    markPaymentCaptured: vi.fn(),
    markPaymentFailed: vi.fn(),
    clearCart: vi.fn(),
  };
}

describe('handlePaymentCaptured', () => {
  it('marks the order paid, clears the cart, and records the event as processed', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).toHaveBeenCalledWith('order_1', 'pay_abc');
    expect(paymentTx.clearCart).toHaveBeenCalledWith('user_1');
    expect(webhookTx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: 'order_1' }));
  });

  it('does nothing when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
  });

  it('does nothing when no matching order is found', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx(null);

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_unknown',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
  });
});

describe('handlePaymentFailed', () => {
  it('marks the matching order as failed', async () => {
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_1' });
    expect(paymentTx.markPaymentFailed).toHaveBeenCalledWith('order_1');
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
  });

  it('does nothing when no matching order is found', async () => {
    const paymentTx = makePaymentTx(null);
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_unknown' });
    expect(paymentTx.markPaymentFailed).not.toHaveBeenCalled();
  });
});
