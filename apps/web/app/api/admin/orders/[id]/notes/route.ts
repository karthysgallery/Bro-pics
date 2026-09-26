import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { UpdateOrderNotesBodySchema } from './notes-request-schema';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-16] Internal staff notes — a plain string field already on the
 * order doc (`Order.notes`, used elsewhere e.g. the CSV export's
 * dedicated column consideration), never customer-visible. Replaces the
 * whole field rather than appending, matching how every other
 * single-field admin PATCH in this codebase works (categories, media,
 * etc.) — the caller sends the full new value.
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

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateOrderNotesBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid notes body', { issues: parsed.error.issues });
  }

  await orderRef.update({ notes: parsed.data.notes });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'order.notes_update',
    resource: 'order',
    resourceId: id,
  }).catch((error) => logger.error('Failed to write audit log', { orderId: id, error: String(error) }));

  return NextResponse.json({ id, notes: parsed.data.notes }, { status: 200 });
}
