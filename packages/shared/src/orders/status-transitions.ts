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
  // [ABE-16] Two parallel paths from here on purpose, not an oversight:
  // 'printed_packed' is the LEGACY combined status, kept reachable for
  // orders already using it and for staff who skip the QC gate entirely.
  // 'quality_check' -> 'packed'/'rework' is the CANONICAL path going
  // forward — new staff tooling (the QC endpoint) should always advance
  // through it, not printed_packed directly.
  in_production: ['printed_packed', 'quality_check', 'cancelled', 'refunded'],
  printed_packed: ['shipped', 'refunded'],
  quality_check: ['packed', 'rework', 'cancelled', 'refunded'],
  // A FAILed QC check goes back to in_production for reprinting/rework,
  // not to a dead end.
  rework: ['in_production', 'cancelled', 'refunded'],
  packed: ['shipped', 'refunded'],
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

/**
 * [ABE-16] The legal next statuses from a given status — exposed so a
 * caller building a 409 response can tell the admin what WOULD have
 * worked, instead of just "no." Returns a copy, not the internal array,
 * so a caller can't mutate the shared transition table.
 */
export function allowedTransitionsFrom(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}
