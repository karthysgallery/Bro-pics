import type { OrderStatus } from '../schemas/order';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['in_production', 'cancelled', 'refunded'],
  in_production: ['printed_packed', 'cancelled', 'refunded'],
  printed_packed: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded', 'replacement_issued'],
  delivered: ['refunded', 'replacement_issued'],
  cancelled: [],
  refunded: [],
  replacement_issued: [],
};

/**
 * The single source of truth for which order-status transitions are legal.
 * Referenced by both the staff-advance route (server-side enforcement) and
 * the staff UI's status picker (so the UI never even offers an invalid
 * choice) — kept in packages/shared specifically so those two can't drift.
 */
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
