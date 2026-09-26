import { z } from 'zod';

/**
 * [ABE-04] The admin-facing request body — deliberately its OWN `.strict()`
 * schema, not `ProductSchema` (packages/shared) with `.strict()` bolted on.
 * `ProductSchema` is shared with read paths under this project's raw-read/
 * validate-on-write convention, and it also carries ~12 Cloud-Function-
 * owned denormalized fields (availableSizes, minPrice/maxPrice, inStock,
 * ratingAverage/ratingCount, primaryImageUrl/hoverImageUrl, titleLower/
 * searchTokens, salesCount) that this route must never accept from a
 * client — `.strict()` here is what actually enforces that ("denormalized
 * fields stay owned by the existing Cloud Functions", per the task text).
 * `isActive` is also excluded on purpose: it's derived from `status`
 * server-side (see route.ts), never independently settable.
 */
export const CreateProductBodySchema = z
  .object({
    title: z.string().min(1),
    slug: z.string().min(1),
    categoryId: z.string().min(1),
    shortDesc: z.string(),
    descriptionHtml: z.string().default(''),
    highlights: z.array(z.string()).default([]),
    howItWorks: z.array(z.string()).default([]),
    careText: z.string().default(''),
    basePrice: z.number().int().nonnegative(),
    isFeatured: z.boolean().default(false),
    badges: z.array(z.string()).default([]),
    dispatchDaysMin: z.number().int().nonnegative().default(3),
    dispatchDaysMax: z.number().int().nonnegative().default(5),
    photoSlots: z.number().int().positive().default(1),
    allowsTextPersonalization: z.boolean().default(false),
    hsnCode: z.string().optional(),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),
    faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).default([]),
    status: z.enum(['draft', 'published', 'archived']).default('draft'),
    relatedProductIds: z.array(z.string()).max(8).default([]),
    frequentlyBoughtTogetherIds: z.array(z.string()).max(8).default([]),
  })
  .strict();

export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

// PATCH — every field optional, same `.strict()` guarantee (an unknown
// key, or one of the denormalized/isActive fields, is rejected the same
// way it would be on create).
export const UpdateProductBodySchema = CreateProductBodySchema.partial();

export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;
