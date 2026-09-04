import { z } from 'zod';
import { OrderStatusSchema } from './order';

export const OrderEventSchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  note: z.string().nullable(),
  courier: z.string().nullable(),
  awbNumber: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;
