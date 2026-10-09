// Server-only: real (value) import of firebase-admin/firestore — NOT
// re-exported from the main barrel (see print-jobs/print-jobs.ts for why).
// Import directly: '@bro-pics/shared/src/payments/firestore-payment-tx'.
import { FieldValue, getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { OrderEventSchema } from '../schemas/order-event';
import { generateInvoiceNo, DEFAULT_INVOICE_PREFIX } from '../orders/invoice-number';
import type { CounterTransaction } from '../orders/order-number';
import { buildQueuedNotification, notificationOutboxId } from '../notifications/notification-outbox';
import { buildQueuedPrintJob } from '../print-jobs/print-jobs';
import { handlePaymentCaptured, handlePaymentFailed, type PaymentEventTransaction } from './payment-events';
import type { WebhookTransaction } from './webhook-idempotency';

export function buildWebhookTx(db: Firestore, transaction: Transaction): WebhookTransaction {
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

export function buildPaymentTx(db: Firestore, transaction: Transaction): PaymentEventTransaction {
  return {
    async findOrderByRazorpayOrderId(razorpayOrderId) {
      const snapshot = await transaction.get(
        db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1)
      );
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      const data = doc.data() as { userId: string; status: string; couponId?: string; orderNo: string; total: number };
      return { id: doc.id, userId: data.userId, status: data.status, couponId: data.couponId, orderNo: data.orderNo, total: data.total };
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
    async generateInvoiceNo() {
      // Same series as in-store bills (see orders/invoice-number.ts), prefix from Admin → Billing settings.
      const settingsSnap = await transaction.get(db.collection('settings').doc('billing'));
      const prefix = (settingsSnap.exists ? (settingsSnap.data() as { invoicePrefix?: string }).invoicePrefix : undefined) || DEFAULT_INVOICE_PREFIX;
      const counterAdapter: CounterTransaction = {
        async get(ref) {
          const snap = await transaction.get(db.doc(ref.path));
          return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
        },
        set(ref, data) {
          transaction.set(db.doc(ref.path), data);
        },
      };
      return generateInvoiceNo(counterAdapter, new Date(), prefix);
    },
    setInvoiceNo(orderId, invoiceNo) {
      transaction.update(db.collection('orders').doc(orderId), { invoiceNo });
      // Hard uniqueness lock: a second document with this number can never be created.
      transaction.create(db.collection('invoiceNumbers').doc(invoiceNo), { invoiceNo, kind: 'invoice', orderId, at: new Date().toISOString() });
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
    incrementUserStats(userId, orderTotal) {
      transaction.update(db.collection('users').doc(userId), {
        totalSpent: FieldValue.increment(orderTotal),
        orderCount: FieldValue.increment(1),
        lastOrderAt: new Date().toISOString(),
      });
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

export interface PaymentSettlement {
  /** Provider event id — the webhook-idempotency key (Razorpay payment id, or a synthetic id for the mock provider). */
  eventId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}

/**
 * Runs the full payment-captured pipeline in one Firestore transaction.
 * Idempotent: a repeated eventId, or an order no longer pending_payment,
 * is a no-op. Used by the Razorpay webhook AND the mock payment provider.
 */
export async function settlePaymentCaptured(db: Firestore, params: PaymentSettlement): Promise<void> {
  await db.runTransaction(async (transaction) => {
    await handlePaymentCaptured(buildWebhookTx(db, transaction), buildPaymentTx(db, transaction), params);
  });
}

export async function settlePaymentFailed(db: Firestore, params: { razorpayOrderId: string }): Promise<void> {
  await db.runTransaction(async (transaction) => {
    await handlePaymentFailed(buildPaymentTx(db, transaction), params);
  });
}

export { getFirestore };
