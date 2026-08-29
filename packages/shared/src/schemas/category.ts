import { z } from 'zod';

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().nullable(),
  image: z.string(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

export type Category = z.infer<typeof CategorySchema>;
