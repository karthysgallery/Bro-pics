import { z } from 'zod';

export const HomepageSectionTypeSchema = z.enum([
  'hero_slider',
  'category_tiles',
  'best_sellers',
  'how_it_works',
  'featured_collection',
  'products_in_motion',
  'reviews_testimonials',
  'why_us',
  'offer_strip',
  'recently_viewed',
]);

export const HomepageSectionSchema = z.object({
  id: z.string(),
  type: HomepageSectionTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  image: z.string(),
  mobileImage: z.string(),
  link: z.string(),
  sortOrder: z.number().int().nonnegative(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  isActive: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

export type HomepageSection = z.infer<typeof HomepageSectionSchema>;
export type HomepageSectionType = z.infer<typeof HomepageSectionTypeSchema>;
