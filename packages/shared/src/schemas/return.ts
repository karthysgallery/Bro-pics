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

// [BE-19] A coarse category for filtering/reporting in the admin returns
// queue — 'reason' below stays the free-text detail the customer actually
// wrote, never replaced by this.
export const ReturnReasonCategorySchema = z.enum(['damaged', 'wrong_item', 'quality', 'changed_mind', 'other']);
export type ReturnReasonCategory = z.infer<typeof ReturnReasonCategorySchema>;

export const ReturnSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  userId: z.string(),
  reasonCategory: ReturnReasonCategorySchema,
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
  // [BE-19] Storage object paths (never signed URLs — see
  // Upload.originalPath's own doc comment for why) for photos the
  // customer attached as evidence. Optional: a return can still be filed
  // without photos, same as before this field existed.
  evidencePaths: z.array(z.string()).optional(),
  // [ABE-23] Set by staff at approve time — records the DECISION
  // ('replacement' means ship a new item instead of refunding; the
  // status machine still only has a single 'refunded' terminal state, so
  // choosing 'replacement' here means staff resolve the return through
  // 'rejected' (no refund) after arranging the replacement outside this
  // flow, rather than a new terminal status. A full replacement-shipment
  // workflow (a new order, inventory, a distinct terminal state) is a
  // materially bigger feature than this field — deliberately not built
  // here, logged rather than silently narrowed, same treatment as every
  // other master-plan-gated item this session.
  resolution: z.enum(['refund', 'replacement']).nullable().optional(),
});

export type ReturnStatus = z.infer<typeof ReturnStatusSchema>;
export type Return = z.infer<typeof ReturnSchema>;
