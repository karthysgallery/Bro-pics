import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  OrderEventSchema,
  orderStatusEvent,
  generateInvoiceNo,
  buildQueuedNotification,
  notificationOutboxId,
  type CounterTransaction,
  type OrderEvent,
  type OrderStatus,
  type NotificationCategory,
} from '@bro-pics/shared';
// Not from the main '@bro-pics/shared' barrel — see print-jobs.ts's own
// doc comment for why (a real firebase-admin/firestore import there
// would break any client bundle this package's barrel ever reaches).
// This file is Cloud Functions server code, so importing it directly is
// exactly the intended use.
import { buildQueuedPrintJob } from '@bro-pics/shared/src/print-jobs/print-jobs';

export interface CustomizationToLock {
  id: string;
  personalizationId: string;
  dpiBand?: 'green' | 'amber' | 'red';
}

export interface OrderItemRef {
  itemId: string;
  personalizationId: string;
  // [BE-25] Needed to increment each purchased product's salesCount by
  // the right amount, not just +1 per line.
  productId: string;
  qty: number;
}

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string; couponId?: string; orderNo: string } | null>;
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
  // [BE-22] Sequential GST invoice number — a read (the counter doc) plus
  // a write (its increment), both bundled inside this one call. Must run
  // before any of this transaction's OTHER writes below, since Firestore
  // requires every read to finish before any write anywhere in the
  // transaction (see generateInvoiceNo's own doc comment for why this is
  // assigned only at payment confirmation, never at order creation).
  generateInvoiceNo(year: number): Promise<string>;
  setInvoiceNo(orderId: string, invoiceNo: string): void;
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
  // [BE-25] Total units ever sold, for a future trending/best-sellers
  // sort — incremented here, not at order creation, for the same reason
  // every other "only once payment is real" counter in this file is
  // (an abandoned pending_payment order never should have counted).
  incrementProductSalesCount(productId: string, qty: number): void;
  // [BE-18] Writes a queued printJobs/{orderId}_{itemId} doc directly in
  // this same transaction — NOT via print-jobs.ts's createPrintJob, which
  // opens its own db.runTransaction and can't be nested inside this one.
  queuePrintJob(orderId: string, itemId: string, personalizationId: string): void;
  // [BE-27a] Queues a notificationOutbox entry for a real channel (email,
  // for now — see NotificationOutboxChannelSchema) inside this same
  // transaction. transitionKey feeds notificationOutboxId, so a
  // redelivered webhook event queuing the same transition twice is a
  // no-op, not a duplicate notification. Only 'paid' and 'payment_failed'
  // are ever queued from this file — payment_confirmed/photo_validation/
  // print_rendering are internal plumbing the customer doesn't act on
  // (the staff-advance route's own NOTIFICATION_BY_STATUS made this same
  // call for those statuses already).
  queueNotification(
    orderId: string,
    userId: string,
    transitionKey: string,
    category: NotificationCategory,
    title: string,
    body: string,
    linkHref: string | null
  ): void;
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
  // [BE-22] Must happen here, with the other reads, before any write
  // below — generateInvoiceNo bundles a read+write of its own counter
  // doc, and Firestore requires every transaction read to finish before
  // any write anywhere in that transaction.
  const invoiceNo = await paymentTx.generateInvoiceNo(new Date().getFullYear());

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.setInvoiceNo(order.id, invoiceNo);
  paymentTx.recordEvent(order.id, orderStatusEvent('paid', 'system'));
  // [BE-27a] The webhook never emitted any customer notification at all
  // before this — a documented gap (see lib/notify.ts's own doc comment
  // in apps/web, written when this file was still out of scope). 'paid'
  // is the one customer-visible milestone in this whole handler.
  paymentTx.queueNotification(
    order.id,
    order.userId,
    'paid',
    'payment',
    'Payment confirmed',
    `Order ${order.orderNo} has been confirmed.`,
    `/orders/${order.id}`
  );
  paymentTx.clearCart(order.userId);
  paymentTx.lockCustomizations(customizationsToLock.map((c) => c.id));
  if (order.couponId) {
    paymentTx.incrementCouponUsedCount(order.couponId);
  }
  // [BE-25] A sale counts once payment is real, regardless of how photo
  // validation later resolves — the customer bought the item either way.
  for (const item of orderItems) {
    paymentTx.incrementProductSalesCount(item.productId, item.qty);
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
  paymentTx.queueNotification(
    order.id,
    order.userId,
    'payment_failed',
    'payment',
    'Payment failed',
    `Payment for order ${order.orderNo} failed. Please try again.`,
    `/orders/${order.id}`
  );
}

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
      const data = doc.data() as { userId: string; status: string; couponId?: string; orderNo: string };
      return { id: doc.id, userId: data.userId, status: data.status, couponId: data.couponId, orderNo: data.orderNo };
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
      return itemsSnapshot.docs.map((doc) => {
        const data = doc.data() as { personalizationId: string; productId: string; qty: number };
        return { itemId: doc.id, personalizationId: data.personalizationId, productId: data.productId, qty: data.qty };
      });
    },
    markPaymentCaptured(orderId, razorpayPaymentId) {
      transaction.update(db.collection('orders').doc(orderId), {
        status: 'paid',
        paymentStatus: 'paid',
        razorpayPaymentId,
      });
    },
    async generateInvoiceNo(year) {
      const counterAdapter: CounterTransaction = {
        async get(ref) {
          const snap = await transaction.get(db.doc(ref.path));
          return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
        },
        set(ref, data) {
          transaction.set(db.doc(ref.path), data);
        },
      };
      return generateInvoiceNo(counterAdapter, year);
    },
    setInvoiceNo(orderId, invoiceNo) {
      transaction.update(db.collection('orders').doc(orderId), { invoiceNo });
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
    incrementProductSalesCount(productId, qty) {
      transaction.update(db.collection('products').doc(productId), { salesCount: FieldValue.increment(qty) });
    },
    setOrderStatus(orderId, status) {
      transaction.update(db.collection('orders').doc(orderId), { status });
    },
    queuePrintJob(orderId, itemId, personalizationId) {
      const job = buildQueuedPrintJob(orderId, itemId, personalizationId);
      transaction.set(db.collection('printJobs').doc(job.id), job);
    },
    queueNotification(orderId, userId, transitionKey, category, title, body, linkHref) {
      const entry = buildQueuedNotification({
        id: notificationOutboxId('order', orderId, transitionKey),
        userId,
        channel: 'email',
        category,
        title,
        body,
        linkHref,
      });
      transaction.set(db.collection('notificationOutbox').doc(entry.id), entry);
    },
  };
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
