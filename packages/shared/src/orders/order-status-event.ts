import type { OrderEvent } from '../schemas/order-event';
import type { OrderStatus } from '../schemas/order';

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
    createdAt: new Date().toISOString(),
    createdBy,
  };
}
