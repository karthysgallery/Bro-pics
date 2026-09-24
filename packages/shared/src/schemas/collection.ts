import { z } from 'zod';

/**
 * [ABE-07] An admin-curated grouping of products (e.g. "New Arrivals",
 * "Anniversary Gifts", a seasonal sale) — distinct from `Category`, which
 * is the taxonomic browse structure (`Product.categoryId`, one category
 * per product). A product can belong to any number of collections, or
 * none; membership is just an ordered id list here, not a field on
 * `Product` itself (no `Product` schema/denormalization change needed —
 * a collection page queries this doc, then fetches its `productIds`).
 */
export const CollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(''),
  image: z.string().default(''),
  productIds: z.array(z.string()).default([]),
  isActive: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Collection = z.infer<typeof CollectionSchema>;
