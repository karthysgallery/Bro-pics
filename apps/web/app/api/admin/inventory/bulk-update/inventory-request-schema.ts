import { z } from 'zod';

/**
 * [ABE-08] One entry per variant to update — `productId` is required
 * because variants live in a `products/{id}/variants/{variantId}`
 * subcollection, not a top-level collection; there's no way to resolve a
 * bare variant id to its Firestore path without it.
 */
export const BulkInventoryUpdateBodySchema = z
  .object({
    updates: z
      .array(
        z
          .object({
            productId: z.string().min(1),
            variantId: z.string().min(1),
            stockStatus: z.enum(['in_stock', 'out_of_stock', 'backorder']),
          })
          .strict()
      )
      .min(1)
      .max(200),
  })
  .strict();

export type BulkInventoryUpdateBody = z.infer<typeof BulkInventoryUpdateBodySchema>;
