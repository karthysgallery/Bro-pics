import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { writeNotification } from '../../../../../../lib/notify';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PhotoValidationBodySchema = z.object({
  action: z.enum(['approve', 'request_reupload', 'reject']),
  reason: z.string().optional(),
  staffNote: z.string().optional(),
});

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
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Orders write access required');
  }

  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsed = PhotoValidationBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid photo validation action', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(id);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Order not found: ${id}`);
  }

  const order = snap.data();
  const nextStatus = parsed.data.action === 'approve' ? 'print_rendering' : 'photo_validation';

  await orderRef.update({
    status: nextStatus,
    photoValidationStatus: parsed.data.action,
    photoValidationNote: parsed.data.staffNote || null,
    updatedAt: new Date().toISOString(),
  });

  // Record order event
  await orderRef.collection('events').add({
    type: 'photo_validation',
    action: parsed.data.action,
    reason: parsed.data.reason || null,
    staffUid: permission.uid,
    createdAt: new Date().toISOString(),
  });

  // If requesting re-upload, trigger customer notification
  if (parsed.data.action === 'request_reupload' && order?.userId) {
    await writeNotification(
      db,
      order.userId,
      'order',
      'Action Needed: High-Resolution Photo Required',
      `Your order #${order.orderNo || id} contains photos that may print blurry. Please tap to upload a higher-resolution original.`,
      `/account/orders/${id}?action=reupload`
    ).catch(() => {});
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: `order.photo_validation.${parsed.data.action}`,
    resource: 'order',
    resourceId: id,
    details: parsed.data,
  });

  return NextResponse.json({ success: true, orderId: id, action: parsed.data.action });
}
