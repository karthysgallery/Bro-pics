import type { ReturnStatus } from '../schemas/return';

const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['pickup_scheduled'],
  rejected: [],
  pickup_scheduled: ['picked_up'],
  picked_up: ['refund_processing'],
  refund_processing: ['refunded'],
  refunded: [],
};

/**
 * Single source of truth for legal return-status transitions, mirroring
 * orders/status-transitions.ts's own role for OrderStatus — referenced by
 * both the staff return-advance route (server-side enforcement) and the
 * admin returns UI's status picker.
 */
export function isValidReturnStatusTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
