import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { PreviewNotificationTemplateBodySchema } from '../../notification-template-request-schema';
import { renderNotificationTemplate, type NotificationTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ key: string }>;
}

/**
 * [ABE-25] Read-only — renders the stored template against admin-
 * supplied sample values via the same pure `renderNotificationTemplate`
 * a future real send path would use, so a preview can never show
 * something the actual send would render differently. Never writes to
 * `notificationOutbox` or sends anything.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { key } = await params;
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('notificationTemplates').doc(key).get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown notification template key: ${key}`);
  }
  const template = snap.data() as NotificationTemplate;

  const rawBody = await request.json().catch(() => ({}));
  const parsed = PreviewNotificationTemplateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid preview body', { issues: parsed.error.issues });
  }

  const rendered = renderNotificationTemplate(template, parsed.data.values);

  return NextResponse.json({ key, ...rendered }, { status: 200 });
}
