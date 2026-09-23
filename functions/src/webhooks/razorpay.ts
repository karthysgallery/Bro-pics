import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OrderEventSchema, type OrderEvent } from '@bro-pics/shared';

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string; couponId?: string } | null>;
  // [BE-14] Only called when a coupon was actually applied — increments
  // AFTER payment is confirmed, not at order creation, so an order the
  // customer abandons at the Razorpay modal (stays pending_payment
  // forever) never burns a use of the coupon.
  incrementCouponUsedCount(couponId: string): void;
  // [BE-10/BE-12] Reads the order's items' personalizationIds, then the
  // matching Customization docs currently in 'ordered' status (set by
  // create-order when the order was placed) — a read, called before any
  // write in handlePaymentCaptured, same "reads before writes" transaction
  // rule the rest of this file already follows.
  findCustomizationIdsToLock(orderId: string): Promise<string[]>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
  recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void;
  // ordered -> locked: payment is now confirmed, so the customizations
  // this order was built from are frozen — an edit attempt via
  // PUT /api/customizations/{id} 409s from here on.
  lockCustomizations(customizationIds: string[]): void;
}

/**
 * Firestore transactions require every read to finish before any write —
 * this function calls isDuplicateWebhookEvent (read) and
 * findOrderByRazorpayOrderId (read) BEFORE any of the writes below (markPaymentCaptured,
 * clearCart, markWebhookProcessed, and recordEvent), mirroring the same rule
 * reconcileSessionOnLogin (Phase 4 Plan A) had to get right for the same reason.
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

  // Guards against a genuinely DIFFERENT payment.captured event (a
  // different Razorpay payment id) arriving for an order that has already
  // settled to paid. isDuplicateWebhookEvent above only protects against a
  // REDELIVERY of the same event id — this protects against a second,
  // distinct capture event for an already-paid order, which would
  // otherwise clearCart() again and silently wipe items the customer
  // added after their previous order already settled.
  if (order.status === 'paid') return;

  const customizationIdsToLock = await paymentTx.findCustomizationIdsToLock(order.id);

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.recordEvent(order.id, {
    status: 'paid',
    note: null,
    courier: null,
    awbNumber: null,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  });
  paymentTx.clearCart(order.userId);
  paymentTx.lockCustomizations(customizationIdsToLock);
  if (order.couponId) {
    paymentTx.incrementCouponUsedCount(order.couponId);
  }
  markWebhookProcessed(webhookTx, params.eventId, order.id);
}

/**
 * Guards against regressing an order that has already settled to paid.
 * payment.captured and payment.failed deliveries for the same order are
 * not guaranteed to arrive in order — a failed-then-retried-successfully
 * payment can have its payment.failed webhook redelivered (or delivered
 * late) after payment.captured already flipped the order to paid. Both
 * handlers now carry two independent guards: isDuplicateWebhookEvent /
 * event-id tracking protects against reprocessing the *same* event twice,
 * while this order.status === 'paid' check (mirrored in
 * handlePaymentCaptured above) is a current-state check that protects
 * against a *different*, stale or out-of-order event undoing — or
 * redundantly repeating side effects on — a settled, correct outcome.
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
      const data = doc.data() as { userId: string; status: string; couponId?: string };
      return { id: doc.id, userId: data.userId, status: data.status, couponId: data.couponId };
    },
    async findCustomizationIdsToLock(orderId) {
      const itemsSnapshot = await transaction.get(db.collection('orders').doc(orderId).collection('items'));
      const personalizationIds = [
        ...new Set(itemsSnapshot.docs.map((doc) => (doc.data() as { personalizationId: string }).personalizationId)),
      ];
      if (personalizationIds.length === 0) return [];

      // Firestore's 'in' operator caps at 30 values per query — chunk
      // rather than assume a cart never has more than 30 distinct
      // personalizations (firestore.rules' carts/{userId} bound is 50
      // line items, so this is a real, if unlikely, ceiling to respect).
      const chunks: string[][] = [];
      for (let i = 0; i < personalizationIds.length; i += 30) {
        chunks.push(personalizationIds.slice(i, i + 30));
      }
      const snapshots = await Promise.all(
        chunks.map((chunk) => transaction.get(db.collection('customizations').where('personalizationId', 'in', chunk)))
      );
      return snapshots.flatMap((snapshot) =>
        snapshot.docs.filter((doc) => (doc.data() as { status?: string }).status === 'ordered').map((doc) => doc.id)
      );
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
    recordEvent(orderId, event) {
      const eventRef = db.collection('orders').doc(orderId).collection('events').doc();
      transaction.set(eventRef, OrderEventSchema.parse({ ...event, id: eventRef.id }));
    },
    lockCustomizations(customizationIds) {
      for (const id of customizationIds) {
        transaction.update(db.collection('customizations').doc(id), { status: 'locked', lockedAt: new Date() });
      }
    },
    incrementCouponUsedCount(couponId) {
      transaction.update(db.collection('coupons').doc(couponId), { usedCount: FieldValue.increment(1) });
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
