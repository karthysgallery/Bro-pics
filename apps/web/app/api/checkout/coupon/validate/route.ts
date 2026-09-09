import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { findCouponByCode } from '../../../../../lib/coupon-lookup';
import { findVariantById } from '../../../../../lib/variant-lookup';
import { priceCartLines, calculateSubtotal, type CartLineInput } from '../../../../../lib/checkout-calc';
import { calculateCouponDiscount } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
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

  const coupon = await findCouponByCode(db, code);
  if (!coupon) {
    return NextResponse.json({ error: 'Unknown coupon code' }, { status: 404 });
  }

  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  const uniqueVariantIds = [...new Set(cartItems.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]);
  const { priced } = priceCartLines(cartItems, variantsById);
  const subtotal = calculateSubtotal(priced);

  if (coupon.perUserLimit) {
    // Query by coupon.code (the normalized, trustworthy value sourced from
    // doc.id inside findCouponByCode), not the raw client-supplied code —
    // orders always write couponId as coupon.code, so matching against
    // anything else could under/over-count a customer's prior usage.
    const usedSnapshot = await db
      .collection('orders')
      .where('userId', '==', userId)
      .where('couponId', '==', coupon.code)
      .get();
    if (usedSnapshot.size >= coupon.perUserLimit) {
      return NextResponse.json({ valid: false, reason: 'per_user_limit_reached' }, { status: 200 });
    }
  }

  const result = calculateCouponDiscount(subtotal, coupon);
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 200 });
  }

  return NextResponse.json(
    { valid: true, discountPaise: result.discountPaise, freeShipping: coupon.type === 'free_ship' },
    { status: 200 }
  );
}
