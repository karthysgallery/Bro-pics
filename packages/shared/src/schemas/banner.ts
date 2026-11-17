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
  // Three separately designed pictures: desktop (1920×720, 8:3), tablet (1200×900, 4:3) and phone (1080×1350, 4:5).
  // Any may be empty: the shop then uses the nearest one that exists, or a text banner when none does.
  image: z.string(),
  tabletImage: z.string().default(''),
  mobileImage: z.string(),
  link: z.string(),
  // The button on the banner, e.g. "Shop the offer".
  ctaLabel: z.string().default(''),
  couponCode: z.string().nullable(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export type Banner = z.infer<typeof BannerSchema>;
