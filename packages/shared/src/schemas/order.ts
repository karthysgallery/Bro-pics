import { z } from 'zod';

// Same-day is deliberately not an option — see checkout-calc.ts's
// DELIVERY_METHODS comment for why (every order needs its own production
// time before a courier is even involved).
export const DeliveryMethodSchema = z.enum(['standard', 'express']);

// [BE-20] Named shipmentTracking, deliberately NOT `shipping` — that name
// is already taken by the shipping FEE (a number, below). Denormalized
// onto the order for the customer-facing tracking link; the underlying
// courier/awbNumber fields and the shipped/delivered timestamps already
// implicit in orders/{id}/events both still exist independently of this.
export const ShipmentTrackingSchema = z.object({
  provider: z.string().min(1),
  awbNumber: z.string().min(1),
  trackingUrl: z.string().nullable(),
  status: z.enum(['shipped', 'delivered']),
  shippedAt: z.string(),
  deliveredAt: z.string().nullable(),
});
export type ShipmentTracking = z.infer<typeof ShipmentTrackingSchema>;

export const OrderStatusSchema = z.enum([
  'pending_payment',
  'paid',
  // System-driven sub-stages between payment and physical production
  // [BE-18]: payment_confirmed (webhook has settled the payment side
  // effects) -> photo_validation (every locked customization checked;
  // green/yellow auto-advances past this, red holds here for staff) ->
  // print_rendering (print jobs queued/rendering) -> print_ready (every
  // job for the order reached 'done'). Staff then manually starts
  // in_production as before.
  'payment_confirmed',
  'photo_validation',
  'print_rendering',
  'print_ready',
  'in_production',
  // [ABE-16] A quality-check gate between production and packing —
  // 'quality_check' -> 'packed' (PASS) or 'rework' (FAIL, sent back to
  // 'in_production'). 'printed_packed' is kept as the legacy combined
  // status (see status-transitions.ts's own comment for which path is
  // canonical going forward).
  'printed_packed',
  'quality_check',
  'packed',
  'rework',
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
    // [BE-25a] Denormalized from the order's line items at creation —
    // lets a future "frequently bought together" query filter orders
    // with `.where('productIds', 'array-contains', productId)` directly,
    // without a collectionGroup query across every order's items
    // subcollection. Optional so an order placed before this field
    // existed still parses.
    productIds: z.array(z.string()).optional(),
    // One per checkout attempt (generated client-side, stable across
    // retries of that same attempt) — lets create-order detect a
    // double-click/retried request and return the existing order instead
    // of creating a duplicate. Optional so an order placed before this
    // field existed still parses.
    idempotencyKey: z.string().optional(),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    // [BE-22] Sequential GST invoice number, assigned once payment is
    // confirmed (never at order creation — see generateInvoiceNo's own
    // doc comment). Absent for any order still pending_payment, and for
    // every order placed before this field existed.
    invoiceNo: z.string().optional(),
    notes: z.string().optional(),
    courier: z.string().optional(),
    awbNumber: z.string().optional(),
    // [BE-20] Optional so an order shipped before this field existed
    // still parses — its courier/awbNumber above remain the source of
    // truth for those, this is purely additive tracking-link/status info.
    shipmentTracking: ShipmentTrackingSchema.optional(),
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
