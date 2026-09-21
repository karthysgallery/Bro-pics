import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { listAllCoupons } from '../../../../lib/coupon-lookup';
import { checkRateLimit } from '../../../../lib/rate-limit';

// coupons is staff-read-only per firestore.rules, so a customer-facing
// "available coupons" list has to go through an admin-backed route like
// every other new collection this round — auth is still required (sign-in
// gated, not literally public) since coupon codes are otherwise-private
// account-adjacent content, not storefront catalog data.
export async function GET(request: Request): Promise<NextResponse> {
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

  const db = getFirestore(getAdminApp());
  const coupons = await listAllCoupons(db);
  const now = new Date();
  const active = coupons.filter(
    (coupon) =>
      now >= coupon.startsAt &&
      now <= coupon.endsAt &&
      (coupon.usageLimit === undefined || coupon.usedCount < coupon.usageLimit)
  );

  return NextResponse.json({ coupons: active }, { status: 200 });
}
