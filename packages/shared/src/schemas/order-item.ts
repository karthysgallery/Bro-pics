import { z } from 'zod';

export const OrderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  personalizationId: z.string(),
  title: z.string().min(1),
  unitPrice: z.number().int().nonnegative(),
  qty: z.number().int().positive(),
  previewUrl: z.string().nullable(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
