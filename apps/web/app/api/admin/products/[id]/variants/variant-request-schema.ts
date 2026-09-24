import { z } from 'zod';

/**
 * [ABE-06] Own `.strict()` request-body schema, same reasoning as
 * products' and categories' own. `printWidthPx`/`printHeightPx`/
 * `minUploadPx`/`aspectRatio` are deliberately excluded — "derive print
 * px and min px from 300 DPI" (the task's own words) means these are
 * ALWAYS server-computed from `widthIn`/`heightIn`
 * (deriveVariantPrintPixels), never client-settable, same treatment as
 * Product's Cloud-Function-owned denormalized fields in ABE-04.
 *
 * `material` is kept, unchanged — per the 2026-09-14 frames-only backend
 * requirements doc's own §2, its explicitly offered "keep as internal/
 * admin-only data, no migration needed" option, since it's no longer a
 * customer-facing filter but the schema field itself was never touched.
 *
 * No `orientation`/design axis field — the same requirements doc's §4 is
 * explicit that a real schema field should only be added "if the business
 * decides orientation should become an independently priced/stocked SKU
 * dimension," which hasn't happened; this is a client-pending business
 * decision (same bucket as shipping rules, HSN codes), not implemented
 * speculatively.
 */
export const CreateVariantBodySchema = z
  .object({
    sku: z.string().min(1),
    sizeLabel: z.string().min(1),
    widthIn: z.number().positive(),
    heightIn: z.number().positive(),
    frameColour: z.string().default(''),
    material: z.string().default(''),
    price: z.number().int().nonnegative(),
    compareAtPrice: z.number().int().nonnegative().optional(),
    stockStatus: z.enum(['in_stock', 'out_of_stock', 'backorder']).default('in_stock'),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateVariantBody = z.infer<typeof CreateVariantBodySchema>;

export const UpdateVariantBodySchema = CreateVariantBodySchema.partial();

export type UpdateVariantBody = z.infer<typeof UpdateVariantBodySchema>;

export const BulkVariantsBodySchema = z
  .object({
    variants: z.array(CreateVariantBodySchema).min(1).max(100),
  })
  .strict();

export type BulkVariantsBody = z.infer<typeof BulkVariantsBodySchema>;
