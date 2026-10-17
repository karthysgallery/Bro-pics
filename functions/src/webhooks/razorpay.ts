import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import {
  handlePaymentCaptured,
  handlePaymentFailed,
  type CustomizationToLock,
  type OrderItemRef,
  type PaymentEventTransaction,
  type OrderStatus,
} from '@bro-pics/shared';
// Server-only adapters — see the doc comment at the top of that module for
// why they aren't in the main barrel.
import { buildPaymentTx, buildWebhookTx } from '@bro-pics/shared/src/payments/firestore-payment-tx';

// The payment-settled pipeline lives in @bro-pics/shared so the mock
// payment provider (apps/web) runs the identical code. Re-exported here so
// existing imports/tests of this module keep working.
export { handlePaymentCaptured, handlePaymentFailed };
export type { CustomizationToLock, OrderItemRef, PaymentEventTransaction };

export interface RefundEventTransaction {
  findRefund(orderId: string, refundId: string): Promise<{ status: string; amount: number } | null>;
  findOrder(orderId: string): Promise<{ total: number; status: OrderStatus } | null>;
  sumProcessedRefunds(orderId: string): Promise<number>;
  markRefundProcessed(orderId: string, refundId: string, razorpayRefundId: string): void;
  markRefundFailed(orderId: string, refundId: string, razorpayRefundId: string, reason: string): void;
  setOrderStatus(orderId: string, status: OrderStatus): void;
}

/**
 * [ABE-23] Same idempotency/read-before-write discipline as
 * handlePaymentCaptured. `orderId`/`refundId` come from `notes` Razorpay
 * echoes back on the refund entity (set when the admin refunds route
 * created the refund) — not a Firestore lookup by `razorpayRefundId`,
 * which would need a collection-group index this environment can't
 * deploy. A refund already `processed` (the admin route's own synchronous
 * Razorpay response already flipped it) is a no-op here, not an error —
 * the event still gets marked processed so a redelivery doesn't loop.
 */
export async function handleRefundProcessed(
  webhookTx: WebhookTransaction,
  refundTx: RefundEventTransaction,
  params: { eventId: string; orderId: string; refundId: string; razorpayRefundId: string }
): Promise<void> {
  const alreadyProcessed = await isDuplicateWebhookEvent(webhookTx, params.eventId);
  if (alreadyProcessed) return;

  const refund = await refundTx.findRefund(params.orderId, params.refundId);
  if (!refund) {
    markWebhookProcessed(webhookTx, params.eventId, params.orderId);
    return;
  }

  if (refund.status !== 'processed') {
    const order = await refundTx.findOrder(params.orderId);
    const priorProcessed = await refundTx.sumProcessedRefunds(params.orderId);

    refundTx.markRefundProcessed(params.orderId, params.refundId, params.razorpayRefundId);

    // A fully-refunded order (this refund plus any prior processed ones
    // reaches the order total) moves to 'refunded' — same convention the
    // admin refunds route's own synchronous path already applies.
    if (order && order.status !== 'refunded' && priorProcessed + refund.amount >= order.total) {
      refundTx.setOrderStatus(params.orderId, 'refunded');
    }
  }

  markWebhookProcessed(webhookTx, params.eventId, params.orderId);
}

export async function handleRefundFailed(
  webhookTx: WebhookTransaction,
  refundTx: RefundEventTransaction,
  params: { eventId: string; orderId: string; refundId: string; razorpayRefundId: string; reason: string }
): Promise<void> {
  const alreadyProcessed = await isDuplicateWebhookEvent(webhookTx, params.eventId);
  if (alreadyProcessed) return;

  const refund = await refundTx.findRefund(params.orderId, params.refundId);
  if (!refund) {
    markWebhookProcessed(webhookTx, params.eventId, params.orderId);
    return;
  }

  if (refund.status !== 'processed') {
    refundTx.markRefundFailed(params.orderId, params.refundId, params.razorpayRefundId, params.reason);
  }

  markWebhookProcessed(webhookTx, params.eventId, params.orderId);
}

function buildRefundTx(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction): RefundEventTransaction {
  return {
    async findRefund(orderId, refundId) {
      const snap = await transaction.get(db.collection('orders').doc(orderId).collection('refunds').doc(refundId));
      if (!snap.exists) return null;
      const data = snap.data() as { status: string; amount: number };
      return { status: data.status, amount: data.amount };
    },
    async findOrder(orderId) {
      const snap = await transaction.get(db.collection('orders').doc(orderId));
      if (!snap.exists) return null;
      const data = snap.data() as { total: number; status: OrderStatus };
      return { total: data.total, status: data.status };
    },
    async sumProcessedRefunds(orderId) {
      const snapshot = await transaction.get(
        db.collection('orders').doc(orderId).collection('refunds').where('status', '==', 'processed')
      );
      return snapshot.docs.reduce((sum, doc) => sum + (doc.data() as { amount: number }).amount, 0);
    },
    markRefundProcessed(orderId, refundId, razorpayRefundId) {
      transaction.update(db.collection('orders').doc(orderId).collection('refunds').doc(refundId), {
        status: 'processed',
        razorpayRefundId,
        processedAt: new Date(),
      });
    },
    markRefundFailed(orderId, refundId, razorpayRefundId, reason) {
      transaction.update(db.collection('orders').doc(orderId).collection('refunds').doc(refundId), {
        status: 'failed',
        razorpayRefundId,
        failureReason: reason,
      });
    },
    setOrderStatus(orderId, status) {
      transaction.update(db.collection('orders').doc(orderId), { status });
    },
  };
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    // [ABE-23] `notes` echoes back exactly what the admin refunds route
    // sent when creating the refund — the vehicle for locating the
    // orders/{id}/refunds/{refundId} doc without a collection-group query.
    refund?: { entity?: { id?: string; status?: string; notes?: { orderId?: string; refundId?: string } } };
  };
}

export const razorpayWebhook = onRequest({ region: 'asia-south1' }, async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (typeof signature !== 'string' || !secret) {
    res.status(400).send('Missing signature or secret');
    return;
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const bodyString = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body);
  if (!verifySignature(bodyString, signature, secret)) {
    res.status(400).send('Invalid signature');
    return;
  }

  const body = req.body as RazorpayWebhookBody;
  const db = getFirestore();

  // [ABE-23] Handled before the payment-entity guard below — a refund
  // webhook's payload shape is `payload.refund.entity`, not
  // `payload.payment.entity`, so it would always be "Ignored: no payment
  // entity" if this ran after that check.
  if (body.event === 'refund.processed' || body.event === 'refund.failed') {
    const refundEntity = body.payload?.refund?.entity;
    const orderId = refundEntity?.notes?.orderId;
    const refundId = refundEntity?.notes?.refundId;
    if (!refundEntity?.id || !orderId || !refundId) {
      res.status(200).send('Ignored: no refund entity/notes');
      return;
    }

    await db.runTransaction(async (transaction) => {
      const webhookTx = buildWebhookTx(db, transaction);
      const refundTx = buildRefundTx(db, transaction);
      if (body.event === 'refund.processed') {
        await handleRefundProcessed(webhookTx, refundTx, {
          eventId: refundEntity.id!,
          orderId,
          refundId,
          razorpayRefundId: refundEntity.id!,
        });
      } else {
        await handleRefundFailed(webhookTx, refundTx, {
          eventId: refundEntity.id!,
          orderId,
          refundId,
          razorpayRefundId: refundEntity.id!,
          reason: 'Razorpay reported refund.failed',
        });
      }
    });
    res.status(200).send('OK');
    return;
  }

  const paymentEntity = body.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    res.status(200).send('Ignored: no payment entity');
    return;
  }

  if (body.event === 'payment.captured') {
    await db.runTransaction(async (transaction) => {
      const webhookTx = buildWebhookTx(db, transaction);
      const paymentTx = buildPaymentTx(db, transaction);
      await handlePaymentCaptured(webhookTx, paymentTx, {
        eventId: paymentEntity.id!,
        razorpayOrderId: paymentEntity.order_id!,
        razorpayPaymentId: paymentEntity.id!,
      });
    });
    res.status(200).send('OK');
    return;
  }

  if (body.event === 'payment.failed') {
    await db.runTransaction(async (transaction) => {
      const paymentTx = buildPaymentTx(db, transaction);
      await handlePaymentFailed(paymentTx, { razorpayOrderId: paymentEntity.order_id! });
    });
    res.status(200).send('OK');
    return;
  }

  res.status(200).send('Ignored: unhandled event type');
});

