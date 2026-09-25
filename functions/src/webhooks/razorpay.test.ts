import { describe, it, expect, vi } from 'vitest';
import { handlePaymentCaptured, handlePaymentFailed, handleRefundProcessed, handleRefundFailed } from './razorpay';
import type { PaymentEventTransaction, CustomizationToLock, OrderItemRef, RefundEventTransaction } from './razorpay';
import type { WebhookTransaction } from './idempotency';

function makeWebhookTx(alreadyProcessed: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists: alreadyProcessed }),
    set: vi.fn(),
  };
}

function makePaymentTx(
  order: { id: string; userId: string; status: string; couponId?: string; orderNo?: string; total?: number } | null,
  customizationsToLock: CustomizationToLock[] = [],
  orderItems: OrderItemRef[] = []
): PaymentEventTransaction {
  return {
    findOrderByRazorpayOrderId: vi
      .fn()
      .mockResolvedValue(order ? { orderNo: 'BP-2026-00001', total: 105000, ...order } : null),
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
    incrementProductSalesCount: vi.fn(),
    incrementUserStats: vi.fn(),
    setOrderStatus: vi.fn(),
    queuePrintJob: vi.fn(),
    queueNotification: vi.fn(),
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

  it('[BE-25] increments each purchased product\'s salesCount by its qty', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx(
      { id: 'order_1', userId: 'user_1', status: 'pending_payment' },
      [],
      [
        { itemId: 'item_1', personalizationId: 'p1', productId: 'prod_1', qty: 1 },
        { itemId: 'item_2', personalizationId: 'p2', productId: 'prod_2', qty: 3 },
      ]
    );

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.incrementProductSalesCount).toHaveBeenCalledWith('prod_1', 1);
    expect(paymentTx.incrementProductSalesCount).toHaveBeenCalledWith('prod_2', 3);
  });

  it('[ABE-26] denormalizes totalSpent/orderCount/lastOrderAt onto the user', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment', total: 250000 });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.incrementUserStats).toHaveBeenCalledWith('user_1', 250000);
  });

  it('[ABE-26] does not denormalize user stats when the order was already processed', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'paid' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.incrementUserStats).not.toHaveBeenCalled();
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
          { itemId: 'item_1', personalizationId: 'p1', productId: 'prod_1', qty: 1 },
          { itemId: 'item_2', personalizationId: 'p2', productId: 'prod_2', qty: 2 },
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
          { itemId: 'item_1', personalizationId: 'p1', productId: 'prod_1', qty: 1 },
          { itemId: 'item_2', personalizationId: 'p2', productId: 'prod_2', qty: 2 },
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

  it('[BE-27a] queues a payment-confirmed email notification, keyed on {orderId}_paid', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment', orderNo: 'BP-2026-00042' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.queueNotification).toHaveBeenCalledWith(
      'order_1',
      'user_1',
      'paid',
      'payment',
      'Payment confirmed',
      expect.stringContaining('BP-2026-00042'),
      '/orders/order_1'
    );
  });

  it('does not queue a notification when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.queueNotification).not.toHaveBeenCalled();
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

  it('[BE-27a] queues a payment-failed email notification, keyed on {orderId}_payment_failed', async () => {
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1', status: 'pending_payment', orderNo: 'BP-2026-00042' });
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_1' });
    expect(paymentTx.queueNotification).toHaveBeenCalledWith(
      'order_1',
      'user_1',
      'payment_failed',
      'payment',
      'Payment failed',
      expect.stringContaining('BP-2026-00042'),
      '/orders/order_1'
    );
  });

  it('does not queue a notification when no matching order is found', async () => {
    const paymentTx = makePaymentTx(null);
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_unknown' });
    expect(paymentTx.queueNotification).not.toHaveBeenCalled();
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

function makeRefundTx(
  refund: { status: string; amount: number } | null,
  order: { total: number; status: string } | null = null,
  processedSum = 0
): RefundEventTransaction {
  return {
    findRefund: vi.fn().mockResolvedValue(refund),
    findOrder: vi.fn().mockResolvedValue(order as never),
    sumProcessedRefunds: vi.fn().mockResolvedValue(processedSum),
    markRefundProcessed: vi.fn(),
    markRefundFailed: vi.fn(),
    setOrderStatus: vi.fn(),
  };
}

describe('handleRefundProcessed', () => {
  it('marks the refund doc processed and the event as handled', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'pending', amount: 50000 }, { total: 105000, status: 'delivered' }, 0);
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.markRefundProcessed).toHaveBeenCalledWith('order_1', 'refund_1', 'rfnd_1');
    expect(webhookTx.set).toHaveBeenCalled();
  });

  it('flips the order to refunded once this refund plus prior processed ones reach the order total', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'pending', amount: 55000 }, { total: 105000, status: 'delivered' }, 50000);
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.setOrderStatus).toHaveBeenCalledWith('order_1', 'refunded');
  });

  it('does not flip the order when this refund is only a partial amount', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'pending', amount: 10000 }, { total: 105000, status: 'delivered' }, 0);
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.setOrderStatus).not.toHaveBeenCalled();
  });

  it('does not re-flip an order already refunded', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'pending', amount: 105000 }, { total: 105000, status: 'refunded' }, 0);
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.setOrderStatus).not.toHaveBeenCalled();
  });

  it('is a no-op (but still marks the event processed) when the refund doc is not found', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx(null);
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.markRefundProcessed).not.toHaveBeenCalled();
    expect(webhookTx.set).toHaveBeenCalled();
  });

  it('does not re-mark an already-processed refund, but still marks the event handled', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'processed', amount: 50000 });
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.markRefundProcessed).not.toHaveBeenCalled();
    expect(webhookTx.set).toHaveBeenCalled();
  });

  it('does nothing at all when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const refundTx = makeRefundTx({ status: 'pending', amount: 50000 });
    await handleRefundProcessed(webhookTx, refundTx, { eventId: 'rfnd_1', orderId: 'order_1', refundId: 'refund_1', razorpayRefundId: 'rfnd_1' });
    expect(refundTx.findRefund).not.toHaveBeenCalled();
    expect(refundTx.markRefundProcessed).not.toHaveBeenCalled();
  });
});

describe('handleRefundFailed', () => {
  it('marks the refund doc failed with the given reason', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'pending', amount: 50000 });
    await handleRefundFailed(webhookTx, refundTx, {
      eventId: 'rfnd_1',
      orderId: 'order_1',
      refundId: 'refund_1',
      razorpayRefundId: 'rfnd_1',
      reason: 'Razorpay reported refund.failed',
    });
    expect(refundTx.markRefundFailed).toHaveBeenCalledWith('order_1', 'refund_1', 'rfnd_1', 'Razorpay reported refund.failed');
  });

  it('does not overwrite an already-processed refund with a failed status', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx({ status: 'processed', amount: 50000 });
    await handleRefundFailed(webhookTx, refundTx, {
      eventId: 'rfnd_1',
      orderId: 'order_1',
      refundId: 'refund_1',
      razorpayRefundId: 'rfnd_1',
      reason: 'late/out-of-order event',
    });
    expect(refundTx.markRefundFailed).not.toHaveBeenCalled();
  });

  it('does nothing when the refund doc is not found', async () => {
    const webhookTx = makeWebhookTx(false);
    const refundTx = makeRefundTx(null);
    await handleRefundFailed(webhookTx, refundTx, {
      eventId: 'rfnd_1',
      orderId: 'order_1',
      refundId: 'refund_1',
      razorpayRefundId: 'rfnd_1',
      reason: 'x',
    });
    expect(refundTx.markRefundFailed).not.toHaveBeenCalled();
  });

  it('does nothing when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const refundTx = makeRefundTx({ status: 'pending', amount: 50000 });
    await handleRefundFailed(webhookTx, refundTx, {
      eventId: 'rfnd_1',
      orderId: 'order_1',
      refundId: 'refund_1',
      razorpayRefundId: 'rfnd_1',
      reason: 'x',
    });
    expect(refundTx.findRefund).not.toHaveBeenCalled();
  });
});
