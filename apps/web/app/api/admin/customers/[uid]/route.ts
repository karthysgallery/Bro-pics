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
  // Product names for the order history (one read per distinct product, first product of each order).
  const firstProduct = (d: FirebaseFirestore.DocumentData) => (Array.isArray(d.productIds) && typeof d.productIds[0] === 'string' ? (d.productIds[0] as string) : null);
  const productIds = [...new Set(ordersSnap.docs.map((d) => firstProduct(d.data())).filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  if (productIds.length) {
    try {
      for (const p of await db.getAll(...productIds.map((id) => db.collection('products').doc(id)))) {
        const t = p.exists ? (p.data() as { title?: unknown }).title : null;
        if (typeof t === 'string') titles.set(p.id, t);
      }
    } catch {
      /* names are optional */
    }
  }
  // Money refunded per order (processed refunds), so the profile shows part and full refunds correctly.
  const refundedByOrder = new Map<string, number>();
  await Promise.all(
    ordersSnap.docs
      .filter((d) => d.data().paymentStatus === 'paid')
      .map(async (d) => {
        try {
          const rs = await d.ref.collection('refunds').where('status', '==', 'processed').get();
          const sum = rs.docs.reduce((t, r) => t + (typeof r.data().amount === 'number' ? (r.data().amount as number) : 0), 0);
          if (sum > 0) refundedByOrder.set(d.id, sum);
        } catch {
          /* refunds are optional */
        }
      })
  );
  const iso = (v: unknown) => (v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate().toISOString() : v ?? null);
  const orders = ordersSnap.docs.map((doc) => {
    const { razorpayOrderId: _razorpayOrderId, razorpayPaymentId: _razorpayPaymentId, amountPaidOnline: _amountPaidOnline, amountDueOnDelivery: _amountDueOnDelivery, ...safe } = doc.data();
    const pid = firstProduct(safe);
    return {
      ...safe,
      id: doc.id ?? safe.id,
      placedAt: iso(safe.placedAt),
      productTitle: pid ? titles.get(pid) ?? null : null,
      productCount: Array.isArray(safe.productIds) ? safe.productIds.length : 0,
      refundedAmount: refundedByOrder.get(doc.id) ?? 0,
    };
  });
  const reviews = reviewsSnap.docs.map((doc) => doc.data());
  const coupons = couponsSnap.docs.map((doc) => doc.data());

  return NextResponse.json({ user, addresses, orders, reviews, coupons }, { status: 200 });
}
