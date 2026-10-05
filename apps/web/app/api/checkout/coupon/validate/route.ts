import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { computeOrderPricing } from '../../../../../lib/order-pricing';
import type { CartLineInput } from '../../../../../lib/checkout-calc';
import { checkRateLimit } from '../../../../../lib/rate-limit';

/**
 * "Does this coupon apply to my cart?" — answered by computeOrderPricing, the
 * very function create-order charges with. (This route used to carry its own
 * copy of the rules and disagreed with create-order on the per-user limit, so a
 * single abandoned checkout made a one-use coupon look used up.)
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
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
  const code = typeof body?.code === 'string' && body.code.trim().length > 0 ? body.code.trim() : null;
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];

  const pricing = await computeOrderPricing(db, { userId, cartItems, couponCode: code, deliveryMethod: 'standard' });
  const coupon = pricing.coupon;

  if (coupon.requested && !coupon.applied) {
    if (coupon.reason === 'unknown_coupon') {
      return NextResponse.json({ error: 'Unknown coupon code' }, { status: 404 });
    }
    return NextResponse.json({ valid: false, reason: coupon.reason }, { status: 200 });
  }
  if (!coupon.requested || !coupon.applied) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 200 });
  }

  return NextResponse.json({ valid: true, discountPaise: pricing.discount, freeShipping: coupon.freeShipping }, { status: 200 });
}
