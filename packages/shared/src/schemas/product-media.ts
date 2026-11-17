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
  /**
   * The shop card's picture (`listing`) or its hover picture (`listing-hover`): the styled photos. Or one of the
   * owner's own photos standing in for a standard gallery picture: `gallery-table` (picture 2), `gallery-hall`
   * (picture 3), `gallery-size` (picture 4, size guide), `gallery-construction` (picture 5, how it is made).
   */
  role: z.enum(['listing', 'listing-hover', 'gallery-table', 'gallery-hall', 'gallery-size', 'gallery-construction']).optional(),
});

export type ProductMedia = z.infer<typeof ProductMediaSchema>;
export type ProductMediaRole = NonNullable<ProductMedia['role']>;
/** The owner can mark one of their own photos as one of the standard gallery pictures. */
export const GALLERY_ROLES = ['gallery-table', 'gallery-hall', 'gallery-size', 'gallery-construction'] as const;
