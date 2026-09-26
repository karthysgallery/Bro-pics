import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { sanitizeRichText } from '../../../../../lib/sanitize-rich-text';
import { UpdateFaqBodySchema } from '../faq-request-schema';
import { logger, type FaqItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('faqs').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown FAQ id: ${id}`);
  }
  const current = snap.data() as FaqItem;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateFaqBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid FAQ body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const update: Record<string, unknown> = { ...body };
  if (body.answerHtml !== undefined) {
    update.answerHtml = sanitizeRichText(body.answerHtml);
  }
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'faq.update',
    resource: 'faq',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { faqId: id, error: String(error) }));

  return NextResponse.json({ faq: { ...current, ...update } }, { status: 200 });
}
