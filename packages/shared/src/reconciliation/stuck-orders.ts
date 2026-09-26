export interface OrderForReconciliation {
  id: string;
  status: string;
  placedAt: Date;
}

/**
 * [BE-32] An order that's been sitting at pending_payment for longer than
 * the threshold usually means the customer abandoned the Razorpay modal
 * (the common, harmless case — nothing to reconcile) or, less commonly,
 * a real gap: Razorpay captured the payment but the webhook never
 * arrived/processed (delivery failure, a bug, a dropped event). Both look
 * identical from Firestore alone — this only flags the CANDIDATES; a
 * human (or a future step that cross-references the Razorpay API) still
 * has to tell them apart. Pure and synchronous — no Razorpay call here —
 * so the "what counts as stuck" rule is unit-testable without live data.
 */
export function findStuckPendingOrders(
  orders: OrderForReconciliation[],
  now: Date,
  thresholdMinutes = 15
): OrderForReconciliation[] {
  const thresholdMs = thresholdMinutes * 60_000;
  return orders.filter(
    (order) => order.status === 'pending_payment' && now.getTime() - order.placedAt.getTime() > thresholdMs
  );
}
