import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';

const ORDERS_LIMIT = 50;

interface RouteParams {
  params: Promise<{ uid: string }>;
}

/**
 * [ABE-26] "Never expose payment data" — `razorpayOrderId`,
 * `razorpayPaymentId`, `amountPaidOnline`, and `amountDueOnDelivery` are
 * explicitly stripped from every order in this response. Orders use the
 * existing `(userId ASC, placedAt DESC)` composite index — already
 * deployed for the customer's own order-history page — no new index
 * needed. `reviews`/`coupons` are each a plain single-field equality
 * filter (`userId`/`assignedUserId`), which never needs a composite
 * index on its own.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'customers:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Customer read access required');
  }

  const { uid } = await params;
  const db = getFirestore(getAdminApp());
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown customer id: ${uid}`);
  }
  const user = userSnap.data();

  const [addressesSnap, ordersSnap, reviewsSnap, couponsSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('addresses').get(),
    db.collection('orders').where('userId', '==', uid).orderBy('placedAt', 'desc').limit(ORDERS_LIMIT).get(),
    db.collection('reviews').where('userId', '==', uid).get(),
    db.collection('coupons').where('assignedUserId', '==', uid).get(),
  ]);

  const addresses = addressesSnap.docs.map((doc) => doc.data());
  const orders = ordersSnap.docs.map((doc) => {
    const { razorpayOrderId: _razorpayOrderId, razorpayPaymentId: _razorpayPaymentId, amountPaidOnline: _amountPaidOnline, amountDueOnDelivery: _amountDueOnDelivery, ...safe } = doc.data();
    return safe;
  });
  const reviews = reviewsSnap.docs.map((doc) => doc.data());
  const coupons = couponsSnap.docs.map((doc) => doc.data());

  return NextResponse.json({ user, addresses, orders, reviews, coupons }, { status: 200 });
}
