import type { OrderEvent } from '../schemas/order-event';
import type { OrderStatus } from '../schemas/order';

// A status chain written in one tick (paid -> payment_confirmed ->
// photo_validation -> print_rendering all land within the same millisecond)
// would otherwise get identical createdAt values, and the order timeline
// (orderBy createdAt) can then show them in arbitrary order. Strictly
// increasing within a process keeps a chain in the order it was written.
let lastEventTimeMs = 0;
function monotonicNowIso(): string {
  lastEventTimeMs = Math.max(Date.now(), lastEventTimeMs + 1);
  return new Date(lastEventTimeMs).toISOString();
}

/**
 * The shape every order-status-change caller needs (the webhook's
 * system-driven steps, the staff-advance route, and the print-job
 * completion path) — factored out once a third caller made the
 * duplication real. Only the fields that are genuinely identical across
 * callers live here; courier/awbNumber default to null since only the
 * staff-advance route's 'shipped' transition ever sets them.
 */
export function orderStatusEvent(
  status: OrderStatus,
  createdBy: string,
  extra?: { note?: string | null; courier?: string | null; awbNumber?: string | null }
): Omit<OrderEvent, 'id'> {
  return {
    status,
    note: extra?.note ?? null,
    courier: extra?.courier ?? null,
    awbNumber: extra?.awbNumber ?? null,
    createdAt: monotonicNowIso(),
    createdBy,
  };
}
