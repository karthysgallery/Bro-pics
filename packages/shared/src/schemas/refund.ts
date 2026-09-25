import { z } from 'zod';

/**
 * [ABE-23] Lives at `orders/{orderId}/refunds/{refundId}`. Distinct from
 * the existing return->refund flow (`Return.razorpayRefundId`, a single
 * full-order refund reached only via the return status machine's
 * terminal `refunded` state): this is the admin ad-hoc refund path —
 * full or partial, with or without an originating return — and doubles
 * as the refund audit trail, since every attempt (including a failed
 * one) is its own persisted doc, not just a log line.
 *
 * `status` starts at `pending` — the doc is written BEFORE the Razorpay
 * call (see POST /api/admin/orders/{id}/refunds), so a doc can exist
 * with no `razorpayRefundId` yet (either about to be processed, or an
 * auto-proposed refund from a paid-order cancellation still awaiting
 * staff action). `processed`/`failed` are terminal; `failed` keeps
 * `failureReason` so staff can see why without checking logs.
 */
export const RefundStatusSchema = z.enum(['pending', 'processed', 'failed']);

export const RefundSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.number().int().positive(),
  reason: z.string().nullable(),
  status: RefundStatusSchema,
  razorpayRefundId: z.string().nullable(),
  // Set only when this refund was proposed/triggered by a return; null
  // for a purely ad-hoc admin refund.
  returnId: z.string().nullable(),
  createdAt: z.date(),
  // null for a system-proposed refund (e.g. auto-proposed on a paid-order
  // cancellation) that no staff member has acted on yet.
  createdBy: z.string().nullable(),
  processedAt: z.date().nullable(),
  failureReason: z.string().nullable(),
});

export type Refund = z.infer<typeof RefundSchema>;
export type RefundStatus = z.infer<typeof RefundStatusSchema>;
