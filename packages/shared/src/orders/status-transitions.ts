import type { OrderStatus } from '../schemas/order';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  // [BE-18] paid now flows through payment_confirmed rather than jumping
  // straight to in_production — the webhook drives every step through
  // print_ready automatically except the red-tier hold at
  // photo_validation. in_production itself stays a manual staff action,
  // reachable from paid too so an order predating this chain (or one
  // whose photo-validation/print-rendering steps were skipped for some
  // other reason) is never stuck.
  paid: ['payment_confirmed', 'in_production', 'cancelled', 'refunded'],
  payment_confirmed: ['photo_validation', 'cancelled', 'refunded'],
  // Auto-advances to print_rendering for green/yellow customizations;
  // holds here for a red-tier item until staff advances it manually via
  // the same staff-advance route used for every other transition.
  photo_validation: ['print_rendering', 'cancelled', 'refunded'],
  // print_ready is set automatically once every print job for the order
  // reaches 'done' (see completePrintJobAndAdvanceOrder).
  print_rendering: ['print_ready', 'cancelled', 'refunded'],
  print_ready: ['in_production', 'cancelled', 'refunded'],
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
