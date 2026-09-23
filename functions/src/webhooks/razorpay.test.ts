import { describe, it, expect, vi } from 'vitest';
import { handlePaymentCaptured, handlePaymentFailed } from './razorpay';
import type { PaymentEventTransaction, CustomizationToLock, OrderItemRef } from './razorpay';
import type { WebhookTransaction } from './idempotency';

function makeWebhookTx(alreadyProcessed: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists: alreadyProcessed }),
    set: vi.fn(),
  };
}

function makePaymentTx(
  order: { id: string; userId: string; status: string; couponId?: string } | null,
  customizationsToLock: CustomizationToLock[] = [],
  orderItems: OrderItemRef[] = []
): PaymentEventTransaction {
  return {
    findOrderByRazorpayOrderId: vi.fn().mockResolvedValue(order),
    findCustomizationsToLock: vi.fn().mockResolvedValue(customizationsToLock),
    findOrderItems: vi.fn().mockResolvedValue(orderItems),
    markPaymentCaptured: vi.fn(),
    generateInvoiceNo: vi.fn().mockResolvedValue('INV-2026-00001'),
    setInvoiceNo: vi.fn(),
    markPaymentFailed: vi.fn(),
    clearCart: vi.fn(),
    recordEvent: vi.fn(),
    lockCustomizations: vi.fn(),
    incrementCouponUsedCount: vi.fn(),
    setOrderStatus: vi.fn(),
    queuePrintJob: vi.fn(),
  };
}

describe('handlePaymentCaptured', () => {
  it('marks the order paid, clears the cart, and records the event as processed', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).toHaveBeenCalledWith('order_1', 'pay_abc');
    expect(paymentTx.recordEvent).toHaveBeenCalledWith(
      'order_1',
      expect.objectContaining({ status: 'paid', createdBy: 'system' })
    );
    expect(paymentTx.clearCart).toHaveBeenCalledWith('user_1');
    expect(webhookTx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: 'order_1' }));
  });

  it('[BE-22] assigns a sequential invoice number on payment confirmation', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.generateInvoiceNo).toHaveBeenCalledWith(new Date().getFullYear());
    expect(paymentTx.setInvoiceNo).toHaveBeenCalledWith('order_1', 'INV-2026-00001');
  });

  it('locks every customization returned by findCustomizationsToLock [BE-10/BE-12]', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' }, [
      { id: 'cust_1', personalizationId: 'p1', dpiBand: 'green' },
      { id: 'cust_2', personalizationId: 'p1', dpiBand: 'green' },
    ]);

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.lockCustomizations).toHaveBeenCalledWith(['cust_1', 'cust_2']);
  });

  it('increments the coupon usedCount when the order applied one [BE-14]', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment', couponId: 'NEW10' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.incrementCouponUsedCount).toHaveBeenCalledWith('NEW10');
  });

  it('does not touch usedCount when the order had no coupon', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.incrementCouponUsedCount).not.toHaveBeenCalled();
  });

  it('does not call lockCustomizations when the order was already processed', async () => {
    const webhookTx = makeWebhookTx(true);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' }, [
      { id: 'cust_1', personalizationId: 'p1', dpiBand: 'green' },
    ]);

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.lockCustomizations).not.toHaveBeenCalled();
  });

  it('does nothing when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
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
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
  });

  it('does nothing when the order is already past pending_payment (a different, distinct capture event for an already-settled order)', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'paid' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_new_distinct_event',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_new_distinct_event',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
    expect(webhookTx.set).not.toHaveBeenCalled();
  });

  describe('[BE-18] photo_validation classification', () => {
    it('auto-advances straight through to print_rendering and queues one print job per item when every customization is green/yellow', async () => {
      const webhookTx = makeWebhookTx(false);
      const paymentTx = makePaymentTx(
        { id: 'order_1', userId: 'user_1', status: 'pending_payment' },
        [
          { id: 'cust_1', personalizationId: 'p1', dpiBand: 'green' },
          { id: 'cust_2', personalizationId: 'p2', dpiBand: 'amber' },
        ],
        [
          { itemId: 'item_1', personalizationId: 'p1' },
          { itemId: 'item_2', personalizationId: 'p2' },
        ]
      );

      await handlePaymentCaptured(webhookTx, paymentTx, {
        eventId: 'pay_abc',
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_abc',
      });

      expect(paymentTx.setOrderStatus).toHaveBeenCalledWith('order_1', 'payment_confirmed');
      expect(paymentTx.setOrderStatus).toHaveBeenCalledWith('order_1', 'photo_validation');
      expect(paymentTx.setOrderStatus).toHaveBeenCalledWith('order_1', 'print_rendering');
      expect(paymentTx.queuePrintJob).toHaveBeenCalledWith('order_1', 'item_1', 'p1');
      expect(paymentTx.queuePrintJob).toHaveBeenCalledWith('order_1', 'item_2', 'p2');
    });

    it('holds at photo_validation and queues no print jobs when any customization is red-tier', async () => {
      const webhookTx = makeWebhookTx(false);
      const paymentTx = makePaymentTx(
        { id: 'order_1', userId: 'user_1', status: 'pending_payment' },
        [
          { id: 'cust_1', personalizationId: 'p1', dpiBand: 'green' },
          { id: 'cust_2', personalizationId: 'p2', dpiBand: 'red' },
        ],
        [
          { itemId: 'item_1', personalizationId: 'p1' },
          { itemId: 'item_2', personalizationId: 'p2' },
        ]
      );

      await handlePaymentCaptured(webhookTx, paymentTx, {
        eventId: 'pay_abc',
        razorpayOrderId: 'order_rzp_1',
        razorpayPaymentId: 'pay_abc',
      });

      expect(paymentTx.setOrderStatus).toHaveBeenCalledWith('order_1', 'photo_validation');
      expect(paymentTx.setOrderStatus).not.toHaveBeenCalledWith('order_1', 'print_rendering');
      expect(paymentTx.queuePrintJob).not.toHaveBeenCalled();
    });
  });
});

describe('handlePaymentFailed', () => {
  it('marks the matching order as failed', async () => {
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_1' });
    expect(paymentTx.markPaymentFailed).toHaveBeenCalledWith('order_1');
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
  });

  it('does nothing when no matching order is found', async () => {
    const paymentTx = makePaymentTx(null);
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_unknown' });
    expect(paymentTx.markPaymentFailed).not.toHaveBeenCalled();
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
  });

  it('does nothing when the order is already past pending_payment (out-of-order/redelivered webhook)', async () => {
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'paid' });
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_1' });
    expect(paymentTx.markPaymentFailed).not.toHaveBeenCalled();
    expect(paymentTx.recordEvent).not.toHaveBeenCalled();
  });
});
