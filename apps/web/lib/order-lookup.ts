import type { Firestore } from 'firebase-admin/firestore';
import type { Order } from '@bro-pics/shared';

/**
 * orderNo is a display identifier (BP-2026-00001), not the Firestore
 * document id — this looks it up via a single-field equality query
 * (auto-indexed, no composite index needed), matching the same
 * where('razorpayOrderId', '==', ...) pattern the Razorpay webhook already
 * uses to find an order by a non-doc-id field.
 */
export async function findOrderByOrderNo(
  db: Firestore,
  orderNo: string
): Promise<{ id: string; data: Order } | null> {
  const snapshot = await db.collection('orders').where('orderNo', '==', orderNo).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as Order };
}
