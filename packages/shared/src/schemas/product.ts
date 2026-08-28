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
});

export type Product = z.infer<typeof ProductSchema>;
