import { z } from 'zod';

/**
 * [ABE-21] `.strict()`, kept independent of `CouponSchema`'s own
 * evolution — same reasoning as every other admin write route this
 * session. `usedCount` is deliberately excluded from both schemas below:
 * it's incremented exactly once, atomically, inside
 * `functions/src/webhooks/razorpay.ts`'s `payment.captured` handler, and
 * must never be settable through this CRUD API or it would desync from
 * that increment. `code` is excluded from the update schema — it's the
 * Firestore doc id (normalized uppercase, same convention as
 * `lib/coupon-lookup.ts`), not a field that gets renamed in place.
 */
export const CreateCouponBodySchema = z
  .object({
    code: z.string().min(1),
    type: z.enum(['percent', 'flat', 'free_ship']),
    value: z.number().int().nonnegative(),
    minOrder: z.number().int().nonnegative().optional(),
    maxDiscountCap: z.number().int().nonnegative().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    usageLimit: z.number().int().nonnegative().optional(),
    perUserLimit: z.number().int().nonnegative().optional(),
    appliesTo: z.enum(['all', 'category', 'product']),
    categoryIds: z.array(z.string()).optional(),
    productIds: z.array(z.string()).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateCouponBody = z.infer<typeof CreateCouponBodySchema>;

export const UpdateCouponBodySchema = CreateCouponBodySchema.omit({ code: true }).partial();

export type UpdateCouponBody = z.infer<typeof UpdateCouponBodySchema>;

export const AssignCouponBodySchema = z
  .object({
    userId: z.string().nullable(),
  })
  .strict();

export type AssignCouponBody = z.infer<typeof AssignCouponBodySchema>;
