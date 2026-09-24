import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { writeNotification } from '../../../../../../lib/notify';
import { NOTIFICATION_BY_STATUS } from '../../../../../../lib/order-status-notifications';
import { logger, type Order } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-16] Re-sends the SAME notification copy the order's current
 * status would have sent originally (reuses `NOTIFICATION_BY_STATUS`,
 * extracted from the staff-advance route so the two can't drift) — for
 * "the customer says they never got the shipped email" support cases.
 * 404s if the current status has no notification mapped (an internal
 * sub-stage like quality_check, or pending_payment) rather than silently
 * doing nothing.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const orderSnap = await db.collection('orders').doc(id).get();
  if (!orderSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown order id: ${id}`);
  }
  const order = orderSnap.data() as Order;

  const notification = NOTIFICATION_BY_STATUS[order.status];
  if (!notification) {
    return adminApiError(400, 'invalid_request', `Order status "${order.status}" has no customer notification to resend`);
  }

  await writeNotification(
    db,
    order.userId,
    notification.category,
    notification.title,
    `Order ${order.orderNo} ${notification.body}`,
    `/orders/${id}`
  );

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.resend_notification',
    resource: 'order',
    resourceId: id,
    details: { status: order.status },
  }).catch((error) => logger.error('Failed to write audit log', { orderId: id, error: String(error) }));

  return NextResponse.json({ id, status: order.status, resent: true }, { status: 200 });
}
