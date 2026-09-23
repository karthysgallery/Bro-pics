import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OrderEventSchema, orderStatusEvent, buildQueuedPrintJob, type OrderEvent, type OrderStatus } from '@bro-pics/shared';

export interface CustomizationToLock {
  id: string;
  personalizationId: string;
  dpiBand?: 'green' | 'amber' | 'red';
}

export interface OrderItemRef {
  itemId: string;
  personalizationId: string;
}

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string; couponId?: string } | null>;
  // [BE-14] Only called when a coupon was actually applied — increments
  // AFTER payment is confirmed, not at order creation, so an order the
  // customer abandons at the Razorpay modal (stays pending_payment
  // forever) never burns a use of the coupon.
  incrementCouponUsedCount(couponId: string): void;
  // [BE-10/BE-12/BE-18] Reads the order's items' personalizationIds, then
  // the matching Customization docs currently in 'ordered' status (set by
  // create-order when the order was placed). Now also returns
  // personalizationId + dpiBand per doc so handlePaymentCaptured can both
  // lock them AND classify photo_validation per item.
  findCustomizationsToLock(orderId: string): Promise<CustomizationToLock[]>;
  // [BE-18] The order's line items (itemId + personalizationId) — needed
  // to queue one print job per item once photo_validation passes.
  findOrderItems(orderId: string): Promise<OrderItemRef[]>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
  recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void;
  // ordered -> locked: payment is now confirmed, so the customizations
  // this order was built from are frozen — an edit attempt via
  // PUT /api/customizations/{id} 409s from here on.
  lockCustomizations(customizationIds: string[]): void;
  // [BE-18] Advances the order's own status field (payment_confirmed,
  // photo_validation, print_rendering — never a terminal/manual state,
  // those only ever come from the staff-advance route).
  setOrderStatus(orderId: string, status: OrderStatus): void;
  // [BE-18] Writes a queued printJobs/{orderId}_{itemId} doc directly in
  // this same transaction — NOT via print-jobs.ts's createPrintJob, which
  // opens its own db.runTransaction and can't be nested inside this one.
  queuePrintJob(orderId: string, itemId: string, personalizationId: string): void;
}

const DPI_SEVERITY: Record<'green' | 'amber' | 'red', number> = { green: 0, amber: 1, red: 2 };

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

  // [BE-18] paid is no longer a terminal state — this same call advances
  // it through payment_confirmed and beyond before returning. So the
  // guard against reprocessing a settled order can no longer check for
  // status === 'paid' specifically (a genuinely later, distinct capture
  // event redelivered for this order would see payment_confirmed or
  // further by the time it's read here, never 'paid'). Guarding on
  // "anything other than the pre-payment state" catches every one of
  // those later statuses in one check, same as the original 'paid' guard
  // did for its narrower state space.
  if (order.status !== 'pending_payment') return;

  const customizationsToLock = await paymentTx.findCustomizationsToLock(order.id);
  const orderItems = await paymentTx.findOrderItems(order.id);

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.recordEvent(order.id, orderStatusEvent('paid', 'system'));
  paymentTx.clearCart(order.userId);
  paymentTx.lockCustomizations(customizationsToLock.map((c) => c.id));
  if (order.couponId) {
    paymentTx.incrementCouponUsedCount(order.couponId);
  }

  paymentTx.setOrderStatus(order.id, 'payment_confirmed');
  paymentTx.recordEvent(order.id, orderStatusEvent('payment_confirmed', 'system'));

  paymentTx.setOrderStatus(order.id, 'photo_validation');
  paymentTx.recordEvent(order.id, orderStatusEvent('photo_validation', 'system'));

  // Worst dpiBand across every locked customization, grouped by which
  // item they belong to isn't needed for the go/no-go decision itself —
  // ANY red-tier slot anywhere in the order holds the WHOLE order at
  // photo_validation for staff. Per-item partial progress (some items'
  // print jobs queued while others wait on a red slot) would add real
  // complexity for a fulfillment nuance nothing currently depends on —
  // staff reviews a held order as one unit via the existing admin UI.
  const anyRed = customizationsToLock.some((c) => c.dpiBand === 'red');

  if (!anyRed) {
    for (const item of orderItems) {
      paymentTx.queuePrintJob(order.id, item.itemId, item.personalizationId);
    }
    paymentTx.setOrderStatus(order.id, 'print_rendering');
    paymentTx.recordEvent(order.id, orderStatusEvent('print_rendering', 'system'));
  }
  // anyRed: order stays at photo_validation. Staff advances it to
  // print_rendering via the same staff-advance route used for every
  // other manual transition, which queues the print jobs itself at that
  // point (see apps/web/app/api/staff/orders/[orderNo]/advance/route.ts).

  markWebhookProcessed(webhookTx, params.eventId, order.id);
}

/**
 * Guards against regressing an order that has already settled to paid.
 * payment.captured and payment.failed deliveries for the same order are
 * not guaranteed to arrive in order — a failed-then-retried-successfully
 * payment can have its payment.failed webhook redelivered (or delivered
 * late) after payment.captured already flipped the order past
 * pending_payment. Both handlers now carry two independent guards:
 * isDuplicateWebhookEvent / event-id tracking protects against
 * reprocessing the *same* event twice, while this
 * order.status !== 'pending_payment' check (mirrored in
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
  if (order.status !== 'pending_payment') return;
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
    async findCustomizationsToLock(orderId) {
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
        snapshot.docs
          .filter((doc) => (doc.data() as { status?: string }).status === 'ordered')
          .map((doc) => {
            const data = doc.data() as { personalizationId: string; dpiBand?: 'green' | 'amber' | 'red' };
            return { id: doc.id, personalizationId: data.personalizationId, dpiBand: data.dpiBand };
          })
      );
    },
    async findOrderItems(orderId) {
      const itemsSnapshot = await transaction.get(db.collection('orders').doc(orderId).collection('items'));
      return itemsSnapshot.docs.map((doc) => ({
        itemId: doc.id,
        personalizationId: (doc.data() as { personalizationId: string }).personalizationId,
      }));
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
    setOrderStatus(orderId, status) {
      transaction.update(db.collection('orders').doc(orderId), { status });
    },
    queuePrintJob(orderId, itemId, personalizationId) {
      const job = buildQueuedPrintJob(orderId, itemId, personalizationId);
      transaction.set(db.collection('printJobs').doc(job.id), job);
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
