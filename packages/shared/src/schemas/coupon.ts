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
  usedCount: z.number().int().nonnegative(),
});

export type Coupon = z.infer<typeof CouponSchema>;
