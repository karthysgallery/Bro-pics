import { z } from 'zod';

export const ProductMediaSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  type: z.enum(['image', 'video']),
  url: z.string().min(1),
  alt: z.string(),
  sortOrder: z.number().int().nonnegative(),
});

export type ProductMedia = z.infer<typeof ProductMediaSchema>;
