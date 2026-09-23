import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { getShippingSettings, getGstSettings } from '../../../../lib/firestore-settings';
import { priceCartLines, calculateSubtotal, calculateShipping, type CartLineInput } from '../../../../lib/checkout-calc';
import { findVariantById } from '../../../../lib/variant-lookup';
import { findCouponByCode } from '../../../../lib/coupon-lookup';
import { computeEligibleSubtotal } from '../../../../lib/coupon-eligibility';
import { createRazorpayOrder } from '../../../../lib/razorpay-client';
import { checkRateLimit } from '../../../../lib/rate-limit';
import {
  generateOrderNo,
  OrderSchema,
  OrderItemSchema,
  OrderEventSchema,
  AddressSchema,
  DeliveryMethodSchema,
  calculateCouponDiscount,
  splitGstFromInclusiveTotal,
  type CounterTransaction,
} from '@bro-pics/shared';

// Matches firestore.rules' carts/{userId} bound exactly [BE-09] — this is
// the defense-in-depth copy, since the Admin SDK (which this route uses)
// bypasses Firestore rules entirely. Not a money concern either way
// (unitPrice is always re-derived from the variant below, never trusted
// from the cart line), just closing an unbounded-qty/garbage-data path.
const MAX_LINE_QTY = 20;

function isMalformedCartLine(item: CartLineInput): boolean {
  return (
    typeof item.variantId !== 'string' ||
    item.variantId.length === 0 ||
    typeof item.personalizationId !== 'string' ||
    item.personalizationId.length === 0 ||
    typeof item.title !== 'string' ||
    item.title.length === 0 ||
    typeof item.qty !== 'number' ||
    !Number.isInteger(item.qty) ||
    item.qty <= 0 ||
    item.qty > MAX_LINE_QTY ||
    // previewPath is optional (CartLineInput: `previewPath?: string`) but if
    // present must actually be a string — this also rejects `null`
    // deliberately: the app itself never writes previewPath as null onto a
    // cart line (it's either a real string or the field is simply absent),
    // so a null here can only come from a hand-crafted write to this
    // owner-writable doc, same threat model as a stray number/object.
    (item.previewPath !== undefined && typeof item.previewPath !== 'string')
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'checkout');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const addressId = typeof body?.addressId === 'string' ? body.addressId : null;
  if (!addressId) {
    return NextResponse.json({ error: 'Missing addressId' }, { status: 400 });
  }
  const couponCode =
    typeof body?.couponCode === 'string' && body.couponCode.trim().length > 0 ? body.couponCode.trim() : null;
  const idempotencyKey =
    typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : null;

  // Absent entirely means 'standard' (backward-compatible with clients that
  // predate this field); an explicitly-supplied-but-invalid value is a real
  // client error, not silently coerced.
  let deliveryMethod: 'standard' | 'express' = 'standard';
  if (body?.deliveryMethod !== undefined) {
    const parsedMethod = DeliveryMethodSchema.safeParse(body.deliveryMethod);
    if (!parsedMethod.success) {
      return NextResponse.json({ error: 'Invalid deliveryMethod' }, { status: 400 });
    }
    deliveryMethod = parsedMethod.data;
  }

  const db = getFirestore(getAdminApp());

  // [BE-13] A double-click on "Place Order," a retried request after a
  // network blip, or the customer closing/failing the Razorpay modal and
  // clicking "Place Order" again all reuse the SAME idempotencyKey (the
  // client generates it once per checkout attempt and keeps it stable
  // across retries of that attempt — see checkout/page.tsx). Finding a
  // still-pending order under this key returns it as-is: the same
  // razorpayOrderId is handed back so the customer's retry opens the SAME
  // Razorpay order rather than minting a new one and abandoning the first.
  // An already-paid order under this key means the retry arrived after
  // payment had already gone through — reported distinctly so the client
  // doesn't show a payment modal for something already completed.
  if (idempotencyKey) {
    const existingSnapshot = await db
      .collection('orders')
      .where('userId', '==', userId)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();
    if (!existingSnapshot.empty) {
      const existing = existingSnapshot.docs[0].data() as { id: string; status: string; razorpayOrderId?: string; total: number };
      if (existing.status === 'paid') {
        return NextResponse.json({ error: 'This order has already been paid for', code: 'already_paid', orderId: existing.id }, { status: 409 });
      }
      return NextResponse.json(
        { orderId: existing.id, razorpayOrderId: existing.razorpayOrderId, amount: existing.total, keyId: process.env.RAZORPAY_KEY_ID },
        { status: 200 }
      );
    }
  }

  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  // Validate the cart line shape BEFORE any transaction or Razorpay call —
  // the cart doc has no server-side shape validation (firestore.rules only
  // checks ownership), so a malformed line (blank title, qty <= 0, qty not
  // an integer, etc.) must be rejected here, not after an order number has
  // been burned and a Razorpay order created.
  if (cartItems.some(isMalformedCartLine)) {
    return NextResponse.json({ error: 'Malformed cart line' }, { status: 400 });
  }

  const addressDoc = await db.collection('users').doc(userId).collection('addresses').doc(addressId).get();
  if (!addressDoc.exists) {
    return NextResponse.json({ error: `Unknown addressId: ${addressId}` }, { status: 400 });
  }

  // Validate the address shape BEFORE any transaction or Razorpay call, for
  // the same reason as the cart lines above — an order must never be paid
  // for with an address missing pincode/phone/state.
  const addressParseResult = AddressSchema.safeParse(addressDoc.data());
  if (!addressParseResult.success) {
    return NextResponse.json({ error: 'Malformed address' }, { status: 400 });
  }
  const address = addressParseResult.data;

  // One lookup per distinct variant — cart sizes are small (single digits),
  // so this stays a handful of requests, same pattern /api/customizations
  // already uses for a single variant lookup.
  const uniqueVariantIds = [...new Set(cartItems.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]);

  const { priced, unavailable } = priceCartLines(cartItems, variantsById);
  if (unavailable.length > 0) {
    return NextResponse.json({ unavailable }, { status: 409 });
  }

  const subtotal = calculateSubtotal(priced);
  const shippingSettings = await getShippingSettings();
  const shipping = calculateShipping(subtotal, shippingSettings, deliveryMethod);
  const gstSettings = await getGstSettings();

  let discount = 0;
  let appliedCouponId: string | undefined;
  let effectiveShipping = shipping;

  if (couponCode) {
    const coupon = await findCouponByCode(db, couponCode);
    if (coupon) {
      let perUserOk = true;
      if (coupon.perUserLimit) {
        // Query by coupon.code (the normalized, trustworthy value sourced
        // from doc.id inside findCouponByCode), not the raw couponCode —
        // orders always write couponId as coupon.code, so matching against
        // anything else could under/over-count a customer's prior usage.
        // [BE-14] paymentStatus == 'paid' only — an order the customer
        // abandoned at the Razorpay modal (stays pending_payment forever)
        // must not count against their limit; counting it previously meant
        // an abandoned attempt could permanently burn a one-time coupon.
        const usedSnapshot = await db
          .collection('orders')
          .where('userId', '==', userId)
          .where('couponId', '==', coupon.code)
          .where('paymentStatus', '==', 'paid')
          .get();
        perUserOk = usedSnapshot.size < coupon.perUserLimit;
      }
      if (perUserOk) {
        // [BE-24] For an 'all' coupon this is just the order subtotal
        // (unchanged behavior); for 'category'/'product' it's only the
        // portion of the cart the coupon actually covers, so the
        // discount below can never apply against ineligible items.
        const eligibleSubtotal = await computeEligibleSubtotal(db, priced, coupon);
        const result = calculateCouponDiscount(eligibleSubtotal, coupon);
        if (result.valid) {
          discount = result.discountPaise;
          // Source from coupon.code (normalized, doc.id-backed), not the
          // raw client-supplied couponCode — this value is both written as
          // the order's couponId AND used below as the Firestore doc path
          // for the usedCount increment inside the same batch as the order
          // write, so it must always be the coupon doc's real identity.
          appliedCouponId = coupon.code;
          if (coupon.type === 'free_ship') {
            effectiveShipping = 0;
          }
        }
      }
    }
    // A coupon that's unknown, expired, or otherwise invalid at order time
    // does NOT fail the order — it silently proceeds with discount: 0. See
    // this plan's design doc §3 for why (never block checkout over a
    // coupon race).
  }

  const total = subtotal - discount + effectiveShipping;

  // [BE-22] taxLines is a descriptive GST breakdown of the already
  // GST-inclusive total, for invoice display — never an addition to what
  // the customer pays (see splitGstFromInclusiveTotal's own doc comment).
  // Stays empty until an admin actually configures settings/gst
  // (getGstSettings defaults gstEnabled: false), matching this codebase's
  // existing "safe default until real settings exist" pattern for
  // shipping.
  const taxLines = gstSettings.gstEnabled
    ? [
        {
          ...(gstSettings.gstin && { gstin: gstSettings.gstin }),
          rate: gstSettings.taxRate,
          amount: splitGstFromInclusiveTotal(total, gstSettings.taxRate).gstAmountPaise,
        },
      ]
    : [];

  // Step 1: generate the order number in its own short transaction — this
  // commits BEFORE the Razorpay HTTP call below. An external API call must
  // never sit inside a Firestore transaction (transactions can retry on
  // contention, and Razorpay's API isn't safely repeatable).
  const orderNo = await db.runTransaction(async (transaction) => {
    const adapter: CounterTransaction = {
      async get(ref) {
        const snap = await transaction.get(db.doc(ref.path));
        return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
      },
      set(ref, data) {
        transaction.set(db.doc(ref.path), data);
      },
    };
    return generateOrderNo(adapter, new Date().getFullYear());
  });

  // Step 2: create the Razorpay order, outside any Firestore transaction.
  const razorpayOrder = await createRazorpayOrder({ amount: total, currency: 'INR', receipt: orderNo });

  // Step 3: write the order + order items as a plain batch — a fresh
  // orderId, nothing else can be contending for it, no transaction needed.
  const orderRef = db.collection('orders').doc();
  const order = OrderSchema.parse({
    id: orderRef.id,
    orderNo,
    userId,
    status: 'pending_payment',
    paymentStatus: 'pending',
    subtotal,
    discount,
    shipping: effectiveShipping,
    total,
    addressJson: address,
    // [BE-25a] Denormalized for a future frequently-bought-together query.
    productIds: [...new Set(priced.map((line) => line.productId))],
    razorpayOrderId: razorpayOrder.id,
    placedAt: new Date(),
    deliveryMethod,
    // Same Firestore-rejects-undefined rule as couponId below.
    ...(idempotencyKey && { idempotencyKey }),
    paymentMode: 'prepaid',
    amountPaidOnline: total,
    amountDueOnDelivery: 0,
    taxLines,
    // Firestore's Admin SDK rejects `undefined` field values (this project
    // never sets ignoreUndefinedProperties), so couponId must be omitted
    // entirely — not set to a possibly-undefined value — when no coupon
    // applied.
    ...(appliedCouponId && { couponId: appliedCouponId }),
  });

  const batch = db.batch();
  batch.set(orderRef, order);
  // [BE-14] usedCount is NOT incremented here — an order that stays
  // pending_payment forever (customer abandons the Razorpay modal) must
  // not burn a use of the coupon. razorpayWebhook's payment.captured
  // handler increments it instead, only once payment is actually
  // confirmed. See that file for the increment itself.

  const eventRef = orderRef.collection('events').doc();
  batch.set(
    eventRef,
    OrderEventSchema.parse({
      id: eventRef.id,
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    })
  );

  for (const line of priced) {
    const itemRef = orderRef.collection('items').doc();
    batch.set(itemRef, OrderItemSchema.parse({ ...line, id: itemRef.id }));
  }

  // [BE-10/BE-12] draft -> ordered: a customization referenced by this
  // order can no longer be freely edited via PUT /api/customizations/{id}
  // (that route 409s on anything but 'draft'). Not yet 'locked' — payment
  // hasn't been confirmed, and razorpayWebhook's payment.captured handler
  // is what advances ordered -> locked. One personalizationId can span
  // multiple Customization docs (one per photo slot), so this queries by
  // personalizationId rather than assuming a single doc.
  const uniquePersonalizationIds = [...new Set(priced.map((line) => line.personalizationId))];
  const customizationSnapshots = await Promise.all(
    uniquePersonalizationIds.map((pid) => db.collection('customizations').where('personalizationId', '==', pid).get())
  );
  for (const snapshot of customizationSnapshots) {
    for (const doc of snapshot.docs) {
      if (doc.data().status === 'draft') {
        batch.update(doc.ref, { status: 'ordered' });
      }
    }
  }

  await batch.commit();

  return NextResponse.json(
    { orderId: orderRef.id, razorpayOrderId: razorpayOrder.id, amount: total, keyId: process.env.RAZORPAY_KEY_ID },
    { status: 200 }
  );
}
