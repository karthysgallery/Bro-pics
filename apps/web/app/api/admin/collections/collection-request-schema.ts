import { z } from 'zod';

export const CreateCollectionBodySchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().default(''),
    image: z.string().default(''),
    productIds: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),
  })
  .strict();

export type CreateCollectionBody = z.infer<typeof CreateCollectionBodySchema>;

export const UpdateCollectionBodySchema = CreateCollectionBodySchema.partial();

export type UpdateCollectionBody = z.infer<typeof UpdateCollectionBodySchema>;
