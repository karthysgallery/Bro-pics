import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { logger, type NotificationOutboxEntry } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-25] Resets a `sent`/`failed`/`failed_permanent` entry back to
 * `queued` — the same reset-in-place shape ABE-16's item re-render route
 * uses for `printJobs`, since `notificationOutbox` is the same kind of
 * queue-with-a-worker concept (the worker itself, BE-28/29's email
 * adapter, doesn't exist yet — resending only re-arms the entry for
 * whenever that worker does).
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
  const ref = db.collection('notificationOutbox').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown notification log entry: ${id}`);
  }
  const current = snap.data() as NotificationOutboxEntry;
  if (current.status === 'queued') {
    return adminApiError(409, 'conflict', 'Entry is already queued');
  }

  await ref.update({
    status: 'queued',
    attempts: 0,
    updatedAt: new Date(),
    nextAttemptAt: FieldValue.delete(),
    lastError: FieldValue.delete(),
  });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'notification_log.resend',
    resource: 'notification_log',
    resourceId: id,
    details: { fromStatus: current.status },
  }).catch((error) => logger.error('Failed to write audit log', { id, error: String(error) }));

  return NextResponse.json({ id, status: 'queued' }, { status: 200 });
}
