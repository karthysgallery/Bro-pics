import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string } | null>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
}

/**
 * Firestore transactions require every read to finish before any write —
 * this function calls isDuplicateWebhookEvent (read) and
 * findOrderByRazorpayOrderId (read) BEFORE any of the three writes below,
 * mirroring the same rule reconcileSessionOnLogin (Phase 4 Plan A) had to
 * get right for the same reason.
 */
export async function handlePaymentCaptured(
  webhookTx: WebhookTransaction,
  paymentTx: PaymentEventTransaction,
  params: { eventId: string; razorpayOrderId: string; razorpayPaymentId: string }
): Promise<void> {
  const alreadyProcessed = await isDuplicateWebhookEvent(webhookTx, params.eventId);
  if (alreadyProcessed) return;

  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.clearCart(order.userId);
  markWebhookProcessed(webhookTx, params.eventId, order.id);
}

/**
 * Guards against regressing an order that has already settled to paid.
 * payment.captured and payment.failed deliveries for the same order are
 * not guaranteed to arrive in order — a failed-then-retried-successfully
 * payment can have its payment.failed webhook redelivered (or delivered
 * late) after payment.captured already flipped the order to paid. Unlike
 * payment.captured's replay guard (isDuplicateWebhookEvent, which protects
 * against reprocessing the *same* event twice), this is a current-state
 * check: it protects against a *different*, stale event undoing a
 * settled, correct outcome.
 */
export async function handlePaymentFailed(
  paymentTx: PaymentEventTransaction,
  params: { razorpayOrderId: string }
): Promise<void> {
  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;
  if (order.status === 'paid') return;
  paymentTx.markPaymentFailed(order.id);
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function buildWebhookTx(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction): WebhookTransaction {
  return {
    async get(ref) {
      const snap = await transaction.get(db.doc(ref.path));
      return { exists: snap.exists };
    },
    set(ref, data) {
      transaction.set(db.doc(ref.path), data);
    },
  };
}

function buildPaymentTx(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction): PaymentEventTransaction {
  return {
    async findOrderByRazorpayOrderId(razorpayOrderId) {
      const snapshot = await transaction.get(
        db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1)
      );
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      const data = doc.data() as { userId: string; status: string };
      return { id: doc.id, userId: data.userId, status: data.status };
    },
    markPaymentCaptured(orderId, razorpayPaymentId) {
      transaction.update(db.collection('orders').doc(orderId), {
        status: 'paid',
        paymentStatus: 'paid',
        razorpayPaymentId,
      });
    },
    markPaymentFailed(orderId) {
      transaction.update(db.collection('orders').doc(orderId), { paymentStatus: 'failed' });
    },
    clearCart(userId) {
      transaction.set(db.collection('carts').doc(userId), { items: [] });
    },
  };
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
}

export const razorpayWebhook = onRequest(async (req, res) => {
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
  const paymentEntity = body.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    res.status(200).send('Ignored: no payment entity');
    return;
  }

  const db = getFirestore();

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
