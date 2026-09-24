import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-15] Full order detail: the order doc itself, its `items` and
 * `events` subcollections, and any `returns` docs referencing it —
 * everything `staff/orders/[orderNo]` (order-number lookup, item list
 * only) doesn't already cover. `notes` is a plain string field already
 * on the order doc, not a separate fetch. Refunds live on `returns` docs
 * (`razorpayRefundId`), found via a plain `where('orderId','==', id)`
 * equality query — no composite index needed, no new index required for
 * any query this route makes.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(id);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown order id: ${id}`);
  }

  const [itemsSnap, eventsSnap, returnsSnap] = await Promise.all([
    orderRef.collection('items').get(),
    orderRef.collection('events').orderBy('createdAt', 'asc').get(),
    db.collection('returns').where('orderId', '==', id).get(),
  ]);

  return NextResponse.json(
    {
      order: { id: orderSnap.id, ...orderSnap.data() },
      items: itemsSnap.docs.map((d) => d.data()),
      events: eventsSnap.docs.map((d) => d.data()),
      returns: returnsSnap.docs.map((d) => d.data()),
    },
    { status: 200 }
  );
}
