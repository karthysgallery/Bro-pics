import { z } from 'zod';

/**
 * [ABE-18] One schema covers every "static content page" the site needs —
 * About, Contact, the 4 policy pages (privacy/terms/shipping/refund),
 * How It Works, and the Picture Quality Guide — because they are all
 * structurally identical (slug + title + a rich-text body + SEO fields).
 * A separate schema per page type would just be 8 copies of the same 5
 * fields; `slug` is what tells them apart. `bodyHtml` is expected to
 * already be sanitized (see apps/web/lib/sanitize-rich-text.ts) before it
 * reaches this schema — zod validates shape, not HTML safety.
 */
export const PageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  bodyHtml: z.string(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  isPublished: z.boolean(),
  updatedAt: z.date(),
});

export type Page = z.infer<typeof PageSchema>;
