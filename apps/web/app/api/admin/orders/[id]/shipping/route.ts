import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { UpdateShippingBodySchema } from './shipping-request-schema';
import { logger, type Order, type ShipmentTracking } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-16] `ManualShippingProvider.trackingUrlFor` always returns `null`
 * (see its own doc comment — no real courier API integration exists yet),
 * so `shipmentTracking.trackingUrl` starts empty on every shipped order.
 * This lets staff fill it in by hand after checking the courier's own
 * portal — the one piece of the "shipping endpoint" that's actually
 * missing; courier/AWB themselves are already set by the staff-advance
 * route's transition to 'shipped'.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:write');
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
  const order = orderSnap.data() as Order;
  if (!order.shipmentTracking) {
    return adminApiError(400, 'invalid_request', 'This order has no shipment tracking yet — advance it to shipped first');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateShippingBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid shipping body', { issues: parsed.error.issues });
  }

  const shipmentTracking: ShipmentTracking = { ...order.shipmentTracking, trackingUrl: parsed.data.trackingUrl };
  await orderRef.update({ shipmentTracking });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.shipping_update',
    resource: 'order',
    resourceId: id,
  }).catch((error) => logger.error('Failed to write audit log', { orderId: id, error: String(error) }));

  return NextResponse.json({ id, shipmentTracking }, { status: 200 });
}
