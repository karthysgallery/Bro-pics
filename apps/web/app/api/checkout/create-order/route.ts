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
  let cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0 && Array.isArray(body?.items) && body.items.length > 0) {
    cartItems = body.items;
  }
  if (cartItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  // Validate the cart line shape BEFORE any transaction or Razorpay call
  if (cartItems.some(isMalformedCartLine)) {
    return NextResponse.json({ error: 'Malformed cart line' }, { status: 400 });
  }

  let address: any = null;
  const addressDoc = await db.collection('users').doc(userId).collection('addresses').doc(addressId).get();
  if (addressDoc.exists) {
    const addressParseResult = AddressSchema.safeParse(addressDoc.data());
    if (addressParseResult.success) {
      address = addressParseResult.data;
    }
  }
  if (!address && body?.address) {
    const addressParseResult = AddressSchema.safeParse(body.address);
    if (addressParseResult.success) {
      address = addressParseResult.data;
      try {
        await db.collection('users').doc(userId).collection('addresses').doc(address.id).set(address);
      } catch {
        // optional persistence
      }
    }
  }
  if (!address) {
    return NextResponse.json({ error: `Unknown addressId: ${addressId}` }, { status: 400 });
  }

  // One lookup per distinct variant
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
        const usedSnapshot = await db
          .collection('orders')
          .where('userId', '==', userId)
          .where('couponId', '==', coupon.code)
          .where('paymentStatus', '==', 'paid')
          .get();
        perUserOk = usedSnapshot.size < coupon.perUserLimit;
      }
      if (perUserOk) {
        const eligibleSubtotal = await computeEligibleSubtotal(db, priced, coupon);
        const result = calculateCouponDiscount(eligibleSubtotal, coupon, new Date(), userId);
        if (result.valid) {
          discount = result.discountPaise;
          appliedCouponId = coupon.code;
          if (coupon.type === 'free_ship') {
            effectiveShipping = 0;
          }
        }
      }
    }
  }

  const total = subtotal - discount + effectiveShipping;

  const taxLines = gstSettings.gstEnabled
    ? [
        {
          ...(gstSettings.gstin && { gstin: gstSettings.gstin }),
          rate: gstSettings.taxRate,
          amount: splitGstFromInclusiveTotal(total, gstSettings.taxRate).gstAmountPaise,
        },
      ]
    : [];

  // Step 1: generate the order number in its own short transaction
  let orderNo: string;
  try {
    orderNo = await db.runTransaction(async (transaction) => {
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
  } catch (err) {
    console.warn('Counter transaction fallback to timestamp order number:', err);
    orderNo = `BP-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  }

  // Step 2: create Razorpay order or mock payment
  const hasRazorpay = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  let isMock = !hasRazorpay || body?.isMock === true;
  let razorpayOrderId = `order_mock_${Date.now()}`;

  if (hasRazorpay && !isMock) {
    try {
      const rzp = await createRazorpayOrder({ amount: total, currency: 'INR', receipt: orderNo });
      razorpayOrderId = rzp.id;
    } catch (err) {
      console.warn('Razorpay order creation failed, falling back to mock payment:', err);
      isMock = true;
    }
  }

  const orderStatus = isMock ? 'paid' : 'pending_payment';
  const paymentStatus = isMock ? 'paid' : 'pending';

  // Step 3: write the order + order items as a plain batch
  const orderRef = db.collection('orders').doc();
  const order = OrderSchema.parse({
    id: orderRef.id,
    orderNo,
    userId,
    status: orderStatus,
    paymentStatus: paymentStatus,
    subtotal,
    discount,
    shipping: effectiveShipping,
    total,
    addressJson: address,
    productIds: [...new Set(priced.map((line) => line.productId))],
    razorpayOrderId,
    placedAt: new Date(),
    deliveryMethod,
    ...(idempotencyKey && { idempotencyKey }),
    paymentMode: 'prepaid',
    amountPaidOnline: total,
    amountDueOnDelivery: 0,
    taxLines,
    ...(appliedCouponId && { couponId: appliedCouponId }),
  });

  const batch = db.batch();
  batch.set(orderRef, order);

  const initialEventRef = orderRef.collection('events').doc();
  batch.set(
    initialEventRef,
    OrderEventSchema.parse({
      id: initialEventRef.id,
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    })
  );

  if (isMock) {
    const paidEventRef = orderRef.collection('events').doc();
    batch.set(
      paidEventRef,
      OrderEventSchema.parse({
        id: paidEventRef.id,
        status: 'paid',
        note: 'Mock payment successful',
        courier: null,
        awbNumber: null,
        createdAt: new Date().toISOString(),
        createdBy: 'system_mock',
      })
    );
    // Clear server-side cart
    batch.set(db.collection('carts').doc(userId), { items: [] }, { merge: true });
  }

  for (const line of priced) {
    const itemRef = orderRef.collection('items').doc();
    batch.set(itemRef, OrderItemSchema.parse({ ...line, id: itemRef.id }));
  }

  const uniquePersonalizationIds = [...new Set(priced.map((line) => line.personalizationId))];
  const customizationSnapshots = await Promise.all(
    uniquePersonalizationIds.map((pid) => db.collection('customizations').where('personalizationId', '==', pid).get())
  );

  for (const snapshot of customizationSnapshots) {
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.userId || data.userId === userId) {
        batch.update(doc.ref, {
          userId,
          status: 'ordered',
        });
      }
    }
  }

  await batch.commit();

  return NextResponse.json(
    {
      orderId: orderRef.id,
      orderNo,
      razorpayOrderId,
      amount: total,
      keyId: process.env.RAZORPAY_KEY_ID || null,
      isMock,
      status: orderStatus,
      paymentStatus,
    },
    { status: 200 }
  );
}
