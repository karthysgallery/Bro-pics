import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { DeliveryMethodSchema } from '@bro-pics/shared';
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
  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0) {
    return NextResponse.json({ empty: true }, { status: 200 });
  }

  const pricing = await computeOrderPricing(db, { userId, cartItems, couponCode, deliveryMethod });
  return NextResponse.json(
    {
      empty: false,
      unavailable: pricing.unavailable,
      lines: pricing.priced.map((line) => ({
        variantId: line.variantId,
        personalizationId: line.personalizationId,
        unitPrice: line.unitPrice,
        qty: line.qty,
      })),
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      shipping: pricing.shipping,
      total: pricing.total,
      taxLines: pricing.taxLines.map((t) => ({ rate: t.rate, amount: t.amount })),
      coupon: pricing.coupon,
    },
    { status: 200 }
  );
}
