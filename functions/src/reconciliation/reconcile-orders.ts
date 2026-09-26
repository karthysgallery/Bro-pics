import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { findStuckPendingOrders, type OrderForReconciliation } from '@bro-pics/shared';

export interface ReconciliationDeps {
  fetchPendingOrders(): Promise<OrderForReconciliation[]>;
  writeReconciliationReport(stuckOrderIds: string[], runAt: Date): Promise<void>;
}

/**
 * [BE-32] Scoped to the one sub-item that's fully buildable without a
 * live Razorpay cross-reference: orders stuck at pending_payment past
 * the threshold. NOT built in this pass: "refunds done outside the
 * system" and "the create-order batch-failure gap" — both need fetching
 * and diffing against Razorpay's own payment/refund history, a heavier
 * feature (pagination, rate limits, a real reconciliation window) this
 * pass didn't have room to build carefully. Logged as deferred, not
 * silently dropped. "Alert on mismatch" is also not built — there's no
 * notification channel to alert THROUGH yet (BE-28/29 are blocked on a
 * real provider account); this writes a reconciliations doc a human (or
 * a future admin dashboard) can check instead.
 */
export async function runOrderReconciliation(
  deps: ReconciliationDeps,
  now: Date = new Date()
): Promise<{ stuckOrderIds: string[] }> {
  const pendingOrders = await deps.fetchPendingOrders();
  const stuck = findStuckPendingOrders(pendingOrders, now);
  const stuckOrderIds = stuck.map((order) => order.id);
  await deps.writeReconciliationReport(stuckOrderIds, now);
  return { stuckOrderIds };
}

export const reconcileStuckOrders = onSchedule('every 15 minutes', async () => {
  const db = getFirestore();
  await runOrderReconciliation({
    async fetchPendingOrders() {
      const snapshot = await db.collection('orders').where('status', '==', 'pending_payment').get();
      return snapshot.docs.map((doc) => {
        const data = doc.data() as { placedAt: FirebaseFirestore.Timestamp };
        return { id: doc.id, status: 'pending_payment', placedAt: data.placedAt.toDate() };
      });
    },
    async writeReconciliationReport(stuckOrderIds, runAt) {
      const ref = db.collection('reconciliations').doc();
      await ref.set({
        id: ref.id,
        type: 'stuck_pending_orders',
        runAt: runAt.toISOString(),
        stuckOrderIds,
        stuckCount: stuckOrderIds.length,
      });
    },
  });
});
