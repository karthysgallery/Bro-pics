import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './webhook-idempotency';
import { orderStatusEvent } from '../orders/order-status-event';
import type { OrderEvent } from '../schemas/order-event';
import type { OrderStatus } from '../schemas/order';
import type { NotificationCategory } from '../schemas/notification';

// Single source of truth for "what happens when a payment settles".
// Both the Razorpay webhook (functions/) and the mock payment provider
// (apps/web) run exactly this code, so a mock-paid order goes through the
// same invoice -> payment_confirmed -> photo_validation -> print_rendering
// pipeline a real one does. Pure: no firebase-admin import, safe in the
// client-safe barrel.

export interface CustomizationToLock {
  id: string;
  personalizationId: string;
  dpiBand?: 'green' | 'amber' | 'red';
}

export interface OrderItemRef {
  itemId: string;
  personalizationId: string;
  // [BE-25] Needed to increment each purchased product's salesCount by
  // the right amount, not just +1 per line.
  productId: string;
  qty: number;
}

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(
    razorpayOrderId: string
  ): Promise<{ id: string; userId: string; status: string; couponId?: string; orderNo: string; total: number } | null>;
  // [BE-14] Only called when a coupon was actually applied — increments
  // AFTER payment is confirmed, not at order creation, so an order the
  // customer abandons at the Razorpay modal (stays pending_payment
  // forever) never burns a use of the coupon.
  incrementCouponUsedCount(couponId: string): void;
  // [BE-10/BE-12/BE-18] Reads the order's items' personalizationIds, then
  // the matching Customization docs currently in 'ordered' status (set by
  // create-order when the order was placed). Now also returns
  // personalizationId + dpiBand per doc so handlePaymentCaptured can both
  // lock them AND classify photo_validation per item.
  findCustomizationsToLock(orderId: string): Promise<CustomizationToLock[]>;
  // [BE-18] The order's line items (itemId + personalizationId) — needed
  // to queue one print job per item once photo_validation passes.
  findOrderItems(orderId: string): Promise<OrderItemRef[]>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  // [BE-22] Sequential GST invoice number — a read (the counter doc) plus
  // a write (its increment), both bundled inside this one call. Must run
  // before any of this transaction's OTHER writes below, since Firestore
  // requires every read to finish before any write anywhere in the
  // transaction (see generateInvoiceNo's own doc comment for why this is
  // assigned only at payment confirmation, never at order creation).
  generateInvoiceNo(year: number): Promise<string>;
  setInvoiceNo(orderId: string, invoiceNo: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
  recordEvent(orderId: string, event: Omit<OrderEvent, 'id'>): void;
  // ordered -> locked: payment is now confirmed, so the customizations
  // this order was built from are frozen — an edit attempt via
  // PUT /api/customizations/{id} 409s from here on.
  lockCustomizations(customizationIds: string[]): void;
  // [BE-18] Advances the order's own status field (payment_confirmed,
  // photo_validation, print_rendering — never a terminal/manual state,
  // those only ever come from the staff-advance route).
  setOrderStatus(orderId: string, status: OrderStatus): void;
  // [BE-25] Total units ever sold, for a future trending/best-sellers
  // sort — incremented here, not at order creation, for the same reason
  // every other "only once payment is real" counter in this file is
  // (an abandoned pending_payment order never should have counted).
  incrementProductSalesCount(productId: string, qty: number): void;
  // [ABE-26] Same "only once payment is real" convention as
  // incrementProductSalesCount above — denormalizes totalSpent/orderCount/
  // lastOrderAt onto users/{uid} so an admin customer-detail view doesn't
  // need a live aggregation query over every order to show these.
  incrementUserStats(userId: string, orderTotal: number): void;
  // [BE-18] Writes a queued printJobs/{orderId}_{itemId} doc directly in
  // this same transaction — NOT via print-jobs.ts's createPrintJob, which
  // opens its own db.runTransaction and can't be nested inside this one.
  queuePrintJob(orderId: string, itemId: string, personalizationId: string): void;
  // [BE-27a] Queues a notificationOutbox entry for a real channel (email,
  // for now — see NotificationOutboxChannelSchema) inside this same
  // transaction. transitionKey feeds notificationOutboxId, so a
  // redelivered webhook event queuing the same transition twice is a
  // no-op, not a duplicate notification. Only 'paid' and 'payment_failed'
  // are ever queued from this file — payment_confirmed/photo_validation/
  // print_rendering are internal plumbing the customer doesn't act on
  // (the staff-advance route's own NOTIFICATION_BY_STATUS made this same
  // call for those statuses already).
  queueNotification(
    orderId: string,
    userId: string,
    transitionKey: string,
    category: NotificationCategory,
    title: string,
    body: string,
    linkHref: string | null
  ): void;
}

const DPI_SEVERITY: Record<'green' | 'amber' | 'red', number> = { green: 0, amber: 1, red: 2 };

/**
 * Firestore transactions require every read to finish before any write —
 * this function calls isDuplicateWebhookEvent (read) and
 * findOrderByRazorpayOrderId (read) BEFORE any of the writes below (markPaymentCaptured,
 * clearCart, markWebhookProcessed, and recordEvent), mirroring the same rule
 * reconcileSessionOnLogin (Phase 4 Plan A) had to get right for the same reason.
 */
export async function handlePaymentCaptured(
  webhookTx: WebhookTransaction,
  paymentTx: PaymentEventTransaction,
  params: { eventId: string; razorpayOrderId: string; razorpayPaymentId: string }
): Promise<void> {
  const alreadyProcessed = await isDuplicateWebhookEvent(webhookTx, params.eventId);
  if (alreadyProcessed) return;

  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;

  // [BE-18] paid is no longer a terminal state — this same call advances
  // it through payment_confirmed and beyond before returning. So the
  // guard against reprocessing a settled order can no longer check for
  // status === 'paid' specifically (a genuinely later, distinct capture
  // event redelivered for this order would see payment_confirmed or
  // further by the time it's read here, never 'paid'). Guarding on
  // "anything other than the pre-payment state" catches every one of
  // those later statuses in one check, same as the original 'paid' guard
  // did for its narrower state space.
  if (order.status !== 'pending_payment') return;

  const customizationsToLock = await paymentTx.findCustomizationsToLock(order.id);
  const orderItems = await paymentTx.findOrderItems(order.id);
  // [BE-22] Must happen here, with the other reads, before any write
  // below — generateInvoiceNo bundles a read+write of its own counter
  // doc, and Firestore requires every transaction read to finish before
  // any write anywhere in that transaction.
  const invoiceNo = await paymentTx.generateInvoiceNo(new Date().getFullYear());

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.setInvoiceNo(order.id, invoiceNo);
  paymentTx.recordEvent(order.id, orderStatusEvent('paid', 'system'));
  // [BE-27a] The webhook never emitted any customer notification at all
  // before this — a documented gap (see lib/notify.ts's own doc comment
  // in apps/web, written when this file was still out of scope). 'paid'
  // is the one customer-visible milestone in this whole handler.
  paymentTx.queueNotification(
    order.id,
    order.userId,
    'paid',
    'payment',
    'Payment confirmed',
    `Order ${order.orderNo} has been confirmed.`,
    `/orders/${order.id}`
  );
  paymentTx.clearCart(order.userId);
  paymentTx.lockCustomizations(customizationsToLock.map((c) => c.id));
  if (order.couponId) {
    paymentTx.incrementCouponUsedCount(order.couponId);
  }
  // [BE-25] A sale counts once payment is real, regardless of how photo
  // validation later resolves — the customer bought the item either way.
  for (const item of orderItems) {
    paymentTx.incrementProductSalesCount(item.productId, item.qty);
  }
  // [ABE-26] Same reasoning — denormalize once payment is real.
  paymentTx.incrementUserStats(order.userId, order.total);

  paymentTx.setOrderStatus(order.id, 'payment_confirmed');
  paymentTx.recordEvent(order.id, orderStatusEvent('payment_confirmed', 'system'));

  paymentTx.setOrderStatus(order.id, 'photo_validation');
  paymentTx.recordEvent(order.id, orderStatusEvent('photo_validation', 'system'));

  // Worst dpiBand across every locked customization, grouped by which
  // item they belong to isn't needed for the go/no-go decision itself —
  // ANY red-tier slot anywhere in the order holds the WHOLE order at
  // photo_validation for staff. Per-item partial progress (some items'
  // print jobs queued while others wait on a red slot) would add real
  // complexity for a fulfillment nuance nothing currently depends on —
  // staff reviews a held order as one unit via the existing admin UI.
  const anyRed = customizationsToLock.some((c) => c.dpiBand === 'red');

  if (!anyRed) {
    for (const item of orderItems) {
      paymentTx.queuePrintJob(order.id, item.itemId, item.personalizationId);
    }
    paymentTx.setOrderStatus(order.id, 'print_rendering');
    paymentTx.recordEvent(order.id, orderStatusEvent('print_rendering', 'system'));
  }
  // anyRed: order stays at photo_validation. Staff advances it to
  // print_rendering via the same staff-advance route used for every
  // other manual transition, which queues the print jobs itself at that
  // point (see apps/web/app/api/staff/orders/[orderNo]/advance/route.ts).

  markWebhookProcessed(webhookTx, params.eventId, order.id);
}

/**
 * Guards against regressing an order that has already settled to paid.
 * payment.captured and payment.failed deliveries for the same order are
 * not guaranteed to arrive in order — a failed-then-retried-successfully
 * payment can have its payment.failed webhook redelivered (or delivered
 * late) after payment.captured already flipped the order past
 * pending_payment. Both handlers now carry two independent guards:
 * isDuplicateWebhookEvent / event-id tracking protects against
 * reprocessing the *same* event twice, while this
 * order.status !== 'pending_payment' check (mirrored in
 * handlePaymentCaptured above) is a current-state check that protects
 * against a *different*, stale or out-of-order event undoing — or
 * redundantly repeating side effects on — a settled, correct outcome.
 */
export async function handlePaymentFailed(
  paymentTx: PaymentEventTransaction,
  params: { razorpayOrderId: string }
): Promise<void> {
  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;
  if (order.status !== 'pending_payment') return;
  paymentTx.markPaymentFailed(order.id);
  paymentTx.queueNotification(
    order.id,
    order.userId,
    'payment_failed',
    'payment',
    'Payment failed',
    `Payment for order ${order.orderNo} failed. Please try again.`,
    `/orders/${order.id}`
  );
}
