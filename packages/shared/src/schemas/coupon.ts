import { z } from 'zod';

export const CouponSchema = z.object({
  code: z.string().min(1),
  type: z.enum(['percent', 'flat', 'free_ship']),
  value: z.number().int().nonnegative(),
  minOrder: z.number().int().nonnegative().optional(),
  maxDiscountCap: z.number().int().nonnegative().optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  usageLimit: z.number().int().nonnegative().optional(),
  perUserLimit: z.number().int().nonnegative().optional(),
  appliesTo: z.enum(['all', 'category', 'product']),
  // [BE-24] Only meaningful (and only ever read) when appliesTo is
  // 'category' or 'product' respectively — absent/empty for an 'all'
  // coupon. See eligibleSubtotalForCoupon: a category/product coupon
  // with no ids configured matches nothing, not everything.
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  usedCount: z.number().int().nonnegative(),
  // [ABE-21] Both optional (not defaulted) so every pre-existing Coupon
  // object literal in tests/seed data still typechecks unchanged. Absent
  // `isActive` means active (existing behavior, unaffected); absent
  // `assignedUserId` means public (anyone can use it, existing behavior).
  isActive: z.boolean().optional(),
  assignedUserId: z.string().nullable().optional(),
});

export type Coupon = z.infer<typeof CouponSchema>;
