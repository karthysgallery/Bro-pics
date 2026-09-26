import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateNotificationTemplateBodySchema } from '../notification-template-request-schema';
import { logger, type NotificationTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ key: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  }

  const { key } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('notificationTemplates').doc(key);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown notification template key: ${key}`);
  }
  const current = snap.data() as NotificationTemplate;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateNotificationTemplateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid notification template body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const update = { ...body, updatedAt: new Date(), updatedBy: permission.uid };
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'notification_template.update',
    resource: 'notification_template',
    resourceId: key,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { key, error: String(error) }));

  return NextResponse.json({ template: { ...current, ...update } }, { status: 200 });
}
