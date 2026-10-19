import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { customerIdForPhone, type Customer } from '@bro-pics/shared';
import { normalizePhoneE164 } from '@bro-pics/shared/src/whatsapp/contact-import';
import { orderEventsFromChange, type OrderEvent, type OrderFields } from '@bro-pics/shared/src/whatsapp/order-notifications';
import { createOrderNotifier, type OrderNotifier } from '@bro-pics/shared/src/whatsapp/order-sender';
import { transportFromEnv } from '@bro-pics/shared/src/whatsapp/service';

/**
 * Customer WhatsApp messages for the order lifecycle. They are DERIVED from real changes of the order document (payment
 * verified by the server, production started, shipped with a courier and tracking number, delivered, cancelled, refunded),
 * so the order, payment and invoice code never calls WhatsApp and can never be slowed or broken by it. A message is sent
 * once per (order, event) (see order-sender.ts); failures are recorded and retried with backoff.
 *
 * Stays silent while WHATSAPP_MODE=disabled (or credentials are missing): nothing is queued or logged as failed.
 */

async function customerFor(db: Firestore, order: OrderFields): Promise<Pick<Customer, 'phone' | 'consent'> | null> {
  try {
    const phone = normalizePhoneE164(String(order.addressJson?.phone ?? ''));
    const snap = await db.collection('customers').doc(customerIdForPhone(phone)).get();
    return snap.exists ? (snap.data() as Customer) : null;
  } catch {
    return null;
  }
}

/** Handles one order change. Never throws: a WhatsApp problem must not become an order problem. */
export async function handleOrderChange(db: Firestore, notifier: OrderNotifier, orderId: string, before: OrderFields | undefined, after: OrderFields | undefined): Promise<Array<{ event: OrderEvent; status: string }>> {
  const results: Array<{ event: OrderEvent; status: string }> = [];
  if (!after) return results;
  for (const event of orderEventsFromChange(before, after)) {
    try {
      const customer = await customerFor(db, after);
      const outcome = await notifier.send({ orderId, event, order: after, customer, customerId: customer ? customerIdForPhone(customer.phone) : null });
      results.push({ event, status: outcome.status });
      if (outcome.status === 'failed') logger.warn('Order WhatsApp message failed', { orderId, event, willRetry: outcome.willRetry });
    } catch (err) {
      logger.error('Order WhatsApp message crashed (the order is unaffected)', { orderId, event, error: String(err).slice(0, 200) });
      results.push({ event, status: 'error' });
    }
  }
  return results;
}

function notifier(db: Firestore): OrderNotifier {
  return createOrderNotifier({ db, transport: transportFromEnv() });
}

export const whatsappOnOrderChange = onDocumentWritten({ document: 'orders/{orderId}', region: 'asia-south1', retry: false }, async (event) => {
  const db = getFirestore();
  const before = event.data?.before.data() as OrderFields | undefined;
  const after = event.data?.after.data() as OrderFields | undefined;
  await handleOrderChange(db, notifier(db), event.params.orderId, before, after);
});

/** Retries failed order messages whose backoff time has come. */
export const whatsappRetryFailed = onSchedule({ schedule: 'every 10 minutes', region: 'asia-south1', timeZone: 'Asia/Kolkata', timeoutSeconds: 300 }, async () => {
  const db = getFirestore();
  const wa = notifier(db);
  const due = await wa.dueRetries(50);
  for (const d of due) {
    const snap = await db.collection('orders').doc(d.orderId).get();
    if (!snap.exists) continue;
    const order = snap.data() as OrderFields;
    const customer = await customerFor(db, order);
    try {
      await wa.send({ orderId: d.orderId, event: d.event, order, customer, customerId: customer ? customerIdForPhone(customer.phone) : null });
    } catch (err) {
      logger.error('WhatsApp retry crashed', { orderId: d.orderId, event: d.event, error: String(err).slice(0, 200) });
    }
  }
  if (due.length) logger.info('WhatsApp retries attempted', { count: due.length });
});
