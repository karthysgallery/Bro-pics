import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { AddressSchema, DeliveryMethodSchema, shippingFailureMessage } from '@bro-pics/shared';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { computeOrderPricing } from '../../../../lib/order-pricing';
import type { CartLineInput } from '../../../../lib/checkout-calc';
import { checkRateLimit } from '../../../../lib/rate-limit';

/**
 * The checkout page's price summary, computed on the server with the same
 * function create-order charges with. The page used to sum `unitPriceSnapshot`
 * values saved in the cart (a display value that goes stale the moment an admin
 * changes a price) and do its own shipping/GST maths; it now shows these numbers.
 * Read-only: creates nothing, consumes nothing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
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

  const body = await request.json().catch(() => ({}));
  const couponCode =
    typeof body?.couponCode === 'string' && body.couponCode.trim().length > 0 ? body.couponCode.trim() : null;
  let deliveryMethod: 'standard' | 'express' = 'standard';
  if (body?.deliveryMethod !== undefined) {
    const parsed = DeliveryMethodSchema.safeParse(body.deliveryMethod);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid deliveryMethod' }, { status: 400 });
    deliveryMethod = parsed.data;
  }

  const db = getFirestore(getAdminApp());
  // The address is read from the signed-in customer's own saved addresses: the browser sends only its id,
  // so it cannot name a state or PIN code of its own to change the price.
  let address: { state: string; pincode: string } | null = null;
  if (typeof body?.addressId === 'string' && body.addressId.length > 0 && body.addressId.length <= 128) {
    const snap = await db.collection('users').doc(userId).collection('addresses').doc(body.addressId).get();
    const parsed = snap.exists ? AddressSchema.safeParse(snap.data()) : null;
    if (parsed?.success) address = { state: parsed.data.state, pincode: parsed.data.pincode };
  }
  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0) {
    return NextResponse.json({ empty: true }, { status: 200 });
  }

  const pricing = await computeOrderPricing(db, { userId, cartItems, couponCode, deliveryMethod, address });
  return NextResponse.json(
    {
      empty: false,
      unavailable: pricing.unavailable,
      lines: pricing.priced.map((line) => ({
        variantId: line.variantId,
        personalizationId: line.personalizationId,
        unitPrice: line.unitPrice,
        qty: line.qty,
        ...(line.combo && { comboInstanceId: line.combo.instanceId }),
      })),
      // Each combo as one priced whole, keyed by the cart line's own id (its personalizationId).
      combos: pricing.combos.map((c) => ({ instanceId: c.instanceId, comboId: c.comboId, price: c.price, mrp: c.mrp })),
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      shipping: pricing.shipping,
      // Non-null means shipping cannot be priced yet; the page must not offer "Place order".
      shippingFailure: pricing.shippingFailure,
      shippingMessage: pricing.shippingFailure ? shippingFailureMessage(pricing.shippingFailure, pricing.shippingState ?? undefined) : null,
      shippingBasis: pricing.shippingBasis,
      total: pricing.total,
      taxLines: pricing.taxLines.map((t) => ({ rate: t.rate, amount: t.amount })),
      coupon: pricing.coupon,
    },
    { status: 200 }
  );
}
