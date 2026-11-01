import { z } from 'zod';

export const ProductMediaSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  type: z.enum(['image', 'video']),
  url: z.string().min(1),
  alt: z.string(),
  sortOrder: z.number().int().nonnegative(),
  /** One of the shop photos made automatically. */
  auto: z.boolean().optional(),
  /** The shop card's picture (`listing`) or its hover picture (`listing-hover`): the styled photos. */
  role: z.enum(['listing', 'listing-hover']).optional(),
});

export type ProductMedia = z.infer<typeof ProductMediaSchema>;
