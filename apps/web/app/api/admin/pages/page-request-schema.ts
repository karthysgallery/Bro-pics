import { z } from 'zod';

/**
 * [ABE-18] `.strict()` request-body schema, same reasoning as every other
 * admin write route this session — kept independent of `PageSchema`'s own
 * evolution on the read path. `id` and `updatedAt` are excluded:
 * server-generated / server-set on every write.
 */
export const CreatePageBodySchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    bodyHtml: z.string().default(''),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),
    isPublished: z.boolean().default(false),
  })
  .strict();

export type CreatePageBody = z.infer<typeof CreatePageBodySchema>;

export const UpdatePageBodySchema = CreatePageBodySchema.partial();

export type UpdatePageBody = z.infer<typeof UpdatePageBodySchema>;
