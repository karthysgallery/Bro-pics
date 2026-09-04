import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { getShippingSettings } from '../../../../lib/firestore-settings';
import { priceCartLines, calculateSubtotal, calculateShipping, type CartLineInput } from '../../../../lib/checkout-calc';
import { findVariantById } from '../../../../lib/variant-lookup';
import { createRazorpayOrder } from '../../../../lib/razorpay-client';
import { generateOrderNo, OrderSchema, OrderItemSchema, AddressSchema, type CounterTransaction } from '@bro-pics/shared';

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
    // previewUrl is optional (CartLineInput: `previewUrl?: string`) but if
    // present must actually be a string — this also rejects `null`
    // deliberately: the app itself never writes previewUrl as null onto a
    // cart line (it's either a real string or the field is simply absent),
    // so a null here can only come from a hand-crafted write to this
    // owner-writable doc, same threat model as a stray number/object.
    (item.previewUrl !== undefined && typeof item.previewUrl !== 'string')
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const addressId = typeof body?.addressId === 'string' ? body.addressId : null;
  if (!addressId) {
    return NextResponse.json({ error: 'Missing addressId' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

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
  const shipping = calculateShipping(subtotal, shippingSettings);
  const discount = 0;
  const total = subtotal - discount + shipping;

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
    shipping,
    total,
    addressJson: address,
    razorpayOrderId: razorpayOrder.id,
    placedAt: new Date(),
    paymentMode: 'prepaid',
    amountPaidOnline: total,
    amountDueOnDelivery: 0,
    taxLines: [],
  });

  const batch = db.batch();
  batch.set(orderRef, order);
  for (const line of priced) {
    const itemRef = orderRef.collection('items').doc();
    batch.set(itemRef, OrderItemSchema.parse({ ...line, id: itemRef.id }));
  }
  await batch.commit();

  return NextResponse.json(
    { orderId: orderRef.id, razorpayOrderId: razorpayOrder.id, amount: total, keyId: process.env.RAZORPAY_KEY_ID },
    { status: 200 }
  );
}
