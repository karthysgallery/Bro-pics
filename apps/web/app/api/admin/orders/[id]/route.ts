import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import type { OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-15/16] Full order detail: the order doc itself, its `items` and
 * `events` subcollections, any `returns` docs referencing it, and the
 * `customizations` behind each item (via `personalizationId`) — the
 * piece ABE-16's "red-DPI photo approval" actually needed: staff had no
 * way to SEE which item(s) triggered the red-tier hold at
 * `photo_validation` from the admin API at all. The approval ACTION
 * itself is already covered — `POST /api/staff/orders/{orderNo}/advance`
 * with `{status: 'print_rendering'}` already queues one print job per
 * item and clears the hold (verified by reading `handlePaymentCaptured`'s
 * own comment: "ANY red-tier slot... holds the WHOLE order at
 * photo_validation for staff. Staff advances it to print_rendering
 * manually"), so no new approval endpoint was built — that would just be
 * a second way to do what the existing route already does. `notes` is a
 * plain string field already on the order doc, not a separate fetch.
 * Refunds live on `returns` docs (`razorpayRefundId`), found via a plain
 * `where('orderId','==', id)` equality query — no composite index needed
 * for any query this route makes.
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

  const items = itemsSnap.docs.map((d) => d.data() as OrderItem);
  // 'in' supports up to 30 values — an order with more distinct
  // personalizationIds than that doesn't exist at this catalogue's scale
  // (photoSlots is a handful per product, not dozens of line items).
  const personalizationIds = [...new Set(items.map((item) => item.personalizationId))];
  const customizationsSnap = personalizationIds.length
    ? await db.collection('customizations').where('personalizationId', 'in', personalizationIds.slice(0, 30)).get()
    : null;
  const customizations = customizationsSnap ? customizationsSnap.docs.map((d) => d.data()) : [];

  return NextResponse.json(
    {
      order: { id: orderSnap.id, ...orderSnap.data() },
      items,
      events: eventsSnap.docs.map((d) => d.data()),
      returns: returnsSnap.docs.map((d) => d.data()),
      customizations,
      hasRedDpi: customizations.some((c) => (c as { dpiBand?: string }).dpiBand === 'red'),
    },
    { status: 200 }
  );
}
