import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'pending_payment',
  'paid',
  'in_production',
  'printed_packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'replacement_issued',
]);

export const OrderSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  userId: z.string(),
  status: OrderStatusSchema,
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  shipping: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  couponId: z.string().optional(),
  addressJson: z.record(z.string(), z.unknown()),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  notes: z.string().optional(),
  placedAt: z.date(),
  paymentMode: z.enum(['prepaid', 'partial_cod']),
  amountPaidOnline: z.number().int().nonnegative(),
  amountDueOnDelivery: z.number().int().nonnegative(),
  taxLines: z.array(
    z.object({
      gstin: z.string().optional(),
      rate: z.number().nonnegative(),
      amount: z.number().int().nonnegative(),
    })
  ),
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
