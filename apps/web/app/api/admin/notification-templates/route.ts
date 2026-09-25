import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { CreateNotificationTemplateBodySchema } from './notification-template-request-schema';
import { NotificationTemplateSchema, logger } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateNotificationTemplateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid notification template body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  const ref = db.collection('notificationTemplates').doc(body.key);
  const existing = await ref.get();
  if (existing.exists) {
    return adminApiError(409, 'conflict', `A notification template with key "${body.key}" already exists`);
  }

  const template = NotificationTemplateSchema.parse({ ...body, updatedAt: new Date(), updatedBy: permission.uid });
  await ref.set(template);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'notification_template.create',
    resource: 'notification_template',
    resourceId: body.key,
  }).catch((error) => logger.error('Failed to write audit log', { key: body.key, error: String(error) }));

  return NextResponse.json({ template }, { status: 201 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content read access required');
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('notificationTemplates').get();
  const templates = snapshot.docs.map((doc) => doc.data());

  return NextResponse.json({ templates }, { status: 200 });
}
