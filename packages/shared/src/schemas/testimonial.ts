import { z } from 'zod';

/**
 * [ABE-18] `testimonials` already had a dormant Firestore rules block
 * (public read, admin-SDK-only write — same pattern as `homepageSections`)
 * with no schema or write path behind it until now. `quote` is kept plain
 * text, not rich HTML: unlike a page body or FAQ answer, a testimonial is
 * a short customer quote with no legitimate need for markup, so there's
 * nothing to sanitize.
 */
export const TestimonialSchema = z.object({
  id: z.string(),
  authorName: z.string(),
  authorLocation: z.string().optional(),
  quote: z.string(),
  photo: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export type Testimonial = z.infer<typeof TestimonialSchema>;
