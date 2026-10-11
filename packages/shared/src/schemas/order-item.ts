import { z } from 'zod';
import { OrderPersonalizationSnapshotSchema } from '../personalization/versioning';
import { OrderItemComboSchema } from './combo';

export const OrderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  personalizationId: z.string(),
  title: z.string().min(1),
  unitPrice: z.number().int().nonnegative(),
  qty: z.number().int().positive(),
  // A Storage object path, never a signed URL — see Upload.originalPath.
  previewPath: z.string().nullable(),
  // Variant details as they were at the moment of purchase, copied from the
  // server-side variant at create-order. An order is a historical record: if
  // the variant is later renamed, resized or deleted, the order (and what
  // production/invoicing read from it) must not change. All optional so
  // orders placed before this snapshot existed still parse.
  sku: z.string().optional(),
  sizeLabel: z.string().optional(),
  frameColour: z.string().optional(),
  material: z.string().optional(),
  widthIn: z.number().positive().optional(),
  heightIn: z.number().positive().optional(),
  // Structured personalization (template v2 + the customer's state) frozen at purchase. Optional:
  // orders from before the engine, and non-personalized items, simply don't have it.
  personalization: OrderPersonalizationSnapshotSchema.optional(),
  // Set when this item is one frame of a Combo Offer. Its unitPrice is that frame's share of the
  // combo price (the shares add up to exactly what was charged), so order totals, GST, invoices
  // and refunds work from item prices as for any order.
  combo: OrderItemComboSchema.optional(),
  // Printing finish chosen at purchase ("glitter") and the extra it added to unitPrice (paise).
  // The workshop must see it on the order: a glitter print is made differently.
  finish: z.literal('glitter').optional(),
  finishExtra: z.number().int().nonnegative().optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
