import { z } from 'zod';

// Independent of OrderStatus/status-transitions.ts on purpose — a return
// is its own small lifecycle attached to an already-delivered order, not a
// new branch of the order's own status machine. `refunded` is already a
// legal OrderStatus (used for other refund paths too), so the parent order
// gets moved there once a return actually completes, via the same
// staff-advance route every other status change already goes through —
// this schema doesn't duplicate that transition logic.
export const ReturnStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'pickup_scheduled',
  'picked_up',
  'refund_processing',
  'refunded',
]);

export const ReturnSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  userId: z.string(),
  reason: z.string().min(1),
  status: ReturnStatusSchema,
  requestedAt: z.string(),
  resolvedAt: z.string().nullable(),
  // Full-order-amount by default (see the backend notes doc for why a
  // partial-refund policy isn't assumed here) — set at request time from
  // the order's own total, not recomputed later.
  refundAmount: z.number().int().nonnegative(),
  razorpayRefundId: z.string().nullable().optional(),
  // Staff-entered context on approve/reject (e.g. "item returned damaged,
  // partial approved instead") — optional, distinct from the customer's
  // own `reason` for requesting the return.
  staffNote: z.string().nullable().optional(),
});

export type ReturnStatus = z.infer<typeof ReturnStatusSchema>;
export type Return = z.infer<typeof ReturnSchema>;
