import { z } from 'zod';

/**
 * [ABE-18] `section` is a free-text grouping label (e.g. "Orders",
 * "Shipping") — the public FAQ page's existing hardcoded content is
 * already organized this way (`apps/web/app/(content)/faq/page.tsx`'s
 * `FAQS` array). `answerHtml` is expected to already be sanitized (see
 * apps/web/lib/sanitize-rich-text.ts) before it reaches this schema.
 */
export const FaqItemSchema = z.object({
  id: z.string(),
  section: z.string(),
  question: z.string(),
  answerHtml: z.string(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

export type FaqItem = z.infer<typeof FaqItemSchema>;
