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
  // [BE-22] GST invoices need each line item's HSN code — optional and
  // unset for now, since which HSN code(s) apply to printed photo frames
  // is a real compliance/classification decision the client hasn't made
  // yet (logged, same client-pending bucket as shipping rules). Schema
  // readiness only: once a real code exists, an admin can fill it in and
  // it's ready to flow through to OrderItem/the invoice with no further
  // schema change.
  hsnCode: z.string().optional(),
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

  // [BE-25] Total units ever sold (paid orders only), incremented by
  // razorpayWebhook's payment_confirmed step — for a future trending/
  // best-sellers sort. Optional so a product seeded before this field
  // existed still parses; treated as 0 wherever it's read.
  salesCount: z.number().int().nonnegative().optional(),

  // Interim Firestore-only search fields (see packages/shared/src/search).
  titleLower: z.string(),
  searchTokens: z.array(z.string()),

  // Product FAQ, admin-managed the same way as highlights/howItWorks.
  faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).default([]),

  // Denormalized card images — kept in sync by a Cloud Function trigger on
  // media writes (see functions/src/products/denormalize-media.ts). Both
  // sourced from variant-agnostic (variantId === null) image media only.
  primaryImageUrl: z.string(),
  hoverImageUrl: z.string().nullable(),

  // [ABE-04] Editorial workflow status, additive to `isActive` — NOT a
  // replacement for it. `isActive` stays the single field every storefront
  // query filters on (firestore.indexes.json's composite indexes are all
  // built on `isActive + …`, and this environment can't deploy new ones);
  // `status` is derived-from-and-kept-in-sync-with by the admin write path
  // (`isActive = status === 'published'`), never independently settable
  // through the API. Optional (not `.default()`, same pattern as
  // `salesCount` above) so every pre-existing product — seeded data, and
  // every test fixture across the app that builds a `Product` object
  // literal without this field — still typechecks and parses; callers
  // treat an absent `status` as `'published'`, matching those docs'
  // actual `isActive: true` state.
  status: z.enum(['draft', 'published', 'archived']).optional(),

  // [ABE-04] Admin-curated cross-sell lists, max 8 each per the task spec.
  // Distinct from the storefront's own runtime recommendation logic
  // (lib/recommendations.ts's getNewArrivals/getTrendingProducts) — those
  // are computed, these are hand-picked by an admin. Optional, same
  // reasoning as `status` above.
  relatedProductIds: z.array(z.string()).max(8).optional(),
  frequentlyBoughtTogetherIds: z.array(z.string()).max(8).optional(),
});

export type Product = z.infer<typeof ProductSchema>;
