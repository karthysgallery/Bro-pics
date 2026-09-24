import { z } from 'zod';

/**
 * [ABE-05] Its own `.strict()` request-body schema, same reasoning as
 * ABE-04's product-request-schema.ts — `CategorySchema` (packages/shared)
 * is shared with read paths, and while `Category` has no Cloud-Function-
 * owned denormalized fields today, keeping the request schema separate
 * still buys unknown-field rejection without coupling the admin write
 * contract to the read schema's own evolution.
 */
export const CreateCategoryBodySchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    parentId: z.string().nullable().default(null),
    image: z.string().default(''),
    sortOrder: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),
    heroImage: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

export type CreateCategoryBody = z.infer<typeof CreateCategoryBodySchema>;

export const UpdateCategoryBodySchema = CreateCategoryBodySchema.partial();

export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>;

export const ReorderCategoriesBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderCategoriesBody = z.infer<typeof ReorderCategoriesBodySchema>;
