import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { releaseOrderStock } from '@bro-pics/shared/src/inventory/stock';

/**
 * Counted stock held by an online order goes back when the order is
 * cancelled (by the customer, by staff, or replaced by a newer checkout) or
 * is never paid. One place for every cancellation path; releasing twice is a
 * no-op (see releaseOrderStock).
 */

/** Unpaid this long = abandoned; its held stock is released. */
export const UNPAID_RELEASE_HOURS = 24;

export function shouldRelease(after: { status?: string; stockReservation?: { status?: string } } | undefined): boolean {
  return after?.status === 'cancelled' && after.stockReservation?.status === 'held';
}

export const releaseStockOnCancel = onDocumentUpdated({ document: 'orders/{orderId}', region: 'asia-south1' }, async (event) => {
  const after = event.data?.after.data() as Parameters<typeof shouldRelease>[0];
  if (!shouldRelease(after)) return;
  const released = await releaseOrderStock(getFirestore(), event.params.orderId, 'system', 'order cancelled');
  if (released) logger.info('Stock released for a cancelled order', { orderId: event.params.orderId });
});

export async function releaseUnpaidReservations(now = new Date()): Promise<string[]> {
  const db = getFirestore();
  const cutoff = new Date(now.getTime() - UNPAID_RELEASE_HOURS * 3600_000);
  const snap = await db.collection('orders').where('status', '==', 'pending_payment').where('stockReservation.status', '==', 'held').limit(200).get();
  const released: string[] = [];
  for (const doc of snap.docs) {
    const placedAt = (doc.get('placedAt') as { toDate?: () => Date } | Date | undefined) ?? undefined;
    const when = placedAt instanceof Date ? placedAt : placedAt?.toDate?.();
    if (!when || when > cutoff) continue;
    if (await releaseOrderStock(db, doc.id, 'system', `unpaid for ${UNPAID_RELEASE_HOURS} hours`)) released.push(doc.id);
  }
  return released;
}

export const releaseUnpaidStock = onSchedule({ schedule: 'every 60 minutes', region: 'asia-south1', timeZone: 'Asia/Kolkata' }, async () => {
  const released = await releaseUnpaidReservations();
  if (released.length) logger.info('Released stock held by unpaid orders', { count: released.length, orderIds: released });
});
