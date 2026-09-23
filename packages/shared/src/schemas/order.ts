import { z } from 'zod';

// Same-day is deliberately not an option — see checkout-calc.ts's
// DELIVERY_METHODS comment for why (every order needs its own production
// time before a courier is even involved).
export const DeliveryMethodSchema = z.enum(['standard', 'express']);

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

export const OrderSchema = z
  .object({
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
    // One per checkout attempt (generated client-side, stable across
    // retries of that same attempt) — lets create-order detect a
    // double-click/retried request and return the existing order instead
    // of creating a duplicate. Optional so an order placed before this
    // field existed still parses.
    idempotencyKey: z.string().optional(),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    notes: z.string().optional(),
    courier: z.string().optional(),
    awbNumber: z.string().optional(),
    placedAt: z.date(),
    // Optional so an order placed before this field existed still parses;
    // callers that need a concrete value treat an absent field as
    // 'standard' (the pre-existing, only-ever behavior).
    deliveryMethod: DeliveryMethodSchema.optional(),
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
  })
  .superRefine((order, ctx) => {
    if (order.subtotal - order.discount + order.shipping !== order.total) {
      ctx.addIssue({ code: 'custom', message: 'subtotal - discount + shipping must equal total' });
    }
    if (order.amountPaidOnline + order.amountDueOnDelivery !== order.total) {
      ctx.addIssue({ code: 'custom', message: 'amountPaidOnline + amountDueOnDelivery must equal total' });
    }
  });

export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>;
