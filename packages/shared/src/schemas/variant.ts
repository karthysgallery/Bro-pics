import { z } from 'zod';

export const VariantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string().min(1),
  sizeLabel: z.string(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  frameColour: z.string(),
  material: z.string(),
  price: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().optional(),
  stockStatus: z.enum(['in_stock', 'out_of_stock', 'backorder']),
  /**
   * Counted stock, shared by the website and the store (POS). Off = made to
   * order (unlimited, the default). On = stockQty is the units on hand and
   * every sale, return and adjustment changes it through inventory/stock.ts.
   */
  trackStock: z.boolean().optional(),
  stockQty: z.number().int().optional(),
  printWidthPx: z.number().int().positive(),
  printHeightPx: z.number().int().positive(),
  minUploadPx: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  isActive: z.boolean(),
  // The frame model (catalogue/frame-model.ts) this size is made in; frameColour then holds the model's name.
  frameModelId: z.string().min(1).optional(),
  // Overrides the product's personalizationTemplateId for this size (a
  // collage laid out differently at 8x10 than at 12x18). null = use the product's.
  personalizationTemplateId: z.string().min(1).nullable().optional(),
});

export type Variant = z.infer<typeof VariantSchema>;
export type StockStatus = 'in_stock' | 'out_of_stock' | 'backorder';
