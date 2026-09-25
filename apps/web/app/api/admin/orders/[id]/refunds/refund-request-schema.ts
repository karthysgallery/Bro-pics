import { z } from 'zod';

/**
 * [ABE-23] `refundId` lets this same route PROCESS an existing `pending`
 * refund doc (e.g. one auto-proposed by a paid-order cancellation, which
 * deliberately never calls Razorpay itself) instead of always creating a
 * new one — see route.ts's own doc comment. When `refundId` is given,
 * `amount`/`reason` are ignored (the proposal already fixed them); when
 * omitted, `amount` defaults to the order's full remaining refundable
 * total.
 */
export const CreateRefundBodySchema = z
  .object({
    refundId: z.string().min(1).optional(),
    amount: z.number().int().positive().optional(),
    reason: z.string().optional(),
  })
  .strict();

export type CreateRefundBody = z.infer<typeof CreateRefundBodySchema>;
