import { z } from 'zod';

/**
 * [ABE-20] Distinct from `HomepageSectionSchema`'s `offer_strip` type,
 * which is one static promo band tied to homepage section ordering with
 * no schedule and no coupon link. A banner is schedulable (`startsAt`/
 * `endsAt`, same shape as `HomepageSectionSchema`'s) and can point at a
 * live coupon by code — `couponCode` is validated against `coupons/{code}`
 * (the coupon collection's own doc-id convention, see
 * `lib/coupon-lookup.ts`) on write, not stored as a denormalized copy of
 * coupon fields, so it never drifts from the coupon's own current state.
 */
export const BannerSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  image: z.string(),
  mobileImage: z.string(),
  link: z.string(),
  couponCode: z.string().nullable(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export type Banner = z.infer<typeof BannerSchema>;
