import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { sanitizeRichText } from '../../../../lib/sanitize-rich-text';
import { CreateFaqBodySchema } from './faq-request-schema';
import { FaqItemSchema, logger } from '@bro-pics/shared';

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
  const parsed = CreateFaqBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid FAQ body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  const ref = db.collection('faqs').doc();
  const faq = FaqItemSchema.parse({ id: ref.id, ...body, answerHtml: sanitizeRichText(body.answerHtml) });
  await ref.set(faq);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'faq.create',
    resource: 'faq',
    resourceId: ref.id,
    details: { section: body.section },
  }).catch((error) => logger.error('Failed to write audit log', { faqId: ref.id, error: String(error) }));

  return NextResponse.json({ faq }, { status: 201 });
}
