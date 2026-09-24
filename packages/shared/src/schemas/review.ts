import { z } from 'zod';

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);

// [ABE-22] Only meaningful for an already-`approved` review — a featured
// review can additionally be surfaced on the homepage testimonials strip
// (`reviews_testimonials`), not just its own product page. `null`/absent
// on a featured review means "product page only" (the default anywhere a
// review already shows), same as every other CMS placement enum this
// session (banners, videos) uses null-for-default rather than a magic
// string.
export const ReviewPlacementSchema = z.enum(['product_page', 'homepage']);

export const ReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  userId: z.string(),
  orderId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1),
  body: z.string().min(1),
  // [ABE-22] Storage paths (e.g. `public/reviews/{id}/photo.jpg`), never
  // full URLs — same convention `MediaAssetSchema.path` and every upload-
  // url-minted path this codebase already uses, so a display consumer
  // resolves them the same way (`buildPublicMediaUrl`/signed read URL) as
  // every other stored asset reference. Unenforced by the schema itself
  // (a plain string array) since nothing writes to this field yet — no
  // review submission route wires media upload today — but the
  // convention is set here for whenever one does.
  media: z.array(z.string()),
  isVerified: z.boolean(),
  status: ReviewStatusSchema,
  createdAt: z.date(),
  // [ABE-22] All three optional, not defaulted, so every pre-existing
  // Review object literal in tests/seed data still typechecks unchanged.
  featured: z.boolean().optional(),
  placement: ReviewPlacementSchema.nullable().optional(),
  moderationNote: z.string().nullable().optional(),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type ReviewPlacement = z.infer<typeof ReviewPlacementSchema>;
