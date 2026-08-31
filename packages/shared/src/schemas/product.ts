import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string(),
  shortDesc: z.string(),
  descriptionHtml: z.string(),
  highlights: z.array(z.string()),
  howItWorks: z.array(z.string()),
  careText: z.string(),
  basePrice: z.number().int().nonnegative(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  badges: z.array(z.string()),
  dispatchDaysMin: z.number().int().nonnegative(),
  dispatchDaysMax: z.number().int().nonnegative(),
  photoSlots: z.number().int().positive(),
  allowsTextPersonalization: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),

  // Denormalized filter fields — kept in sync by a Cloud Function trigger
  // on variant writes (see functions/src/products/denormalize.ts).
  availableSizes: z.array(z.string()),
  availableColours: z.array(z.string()),
  availableMaterials: z.array(z.string()),
  minPrice: z.number().int().nonnegative(),
  maxPrice: z.number().int().nonnegative(),
  occasionTags: z.array(z.string()).default([]),
  inStock: z.boolean(),

  // Denormalized rating — kept in sync when a review is approved.
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),

  // Interim Firestore-only search fields (see packages/shared/src/search).
  titleLower: z.string(),
  searchTokens: z.array(z.string()),

  // Product FAQ, admin-managed the same way as highlights/howItWorks.
  faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).default([]),

  // Denormalized card images — kept in sync by a Cloud Function trigger on
  // media writes (see functions/src/products/denormalize-media.ts). Both
  // sourced from variant-agnostic (variantId === null) image media only.
  primaryImageUrl: z.string().min(1),
  hoverImageUrl: z.string().nullable(),
});

export type Product = z.infer<typeof ProductSchema>;
