import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { sanitizeRichText } from '../../../../../lib/sanitize-rich-text';
import { UpdatePageBodySchema } from '../page-request-schema';
import { logger, type Page } from '@bro-pics/shared';

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
  const ref = db.collection('pages').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown page id: ${id}`);
  }
  const current = snap.data() as Page;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdatePageBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid page body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.slug && body.slug !== current.slug) {
    const slugConflict = await db.collection('pages').where('slug', '==', body.slug).limit(1).get();
    if (!slugConflict.empty && slugConflict.docs[0].id !== id) {
      return adminApiError(409, 'conflict', `A page with slug "${body.slug}" already exists`);
    }
  }

  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.bodyHtml !== undefined) {
    update.bodyHtml = sanitizeRichText(body.bodyHtml);
  }
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'page.update',
    resource: 'page',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { pageId: id, error: String(error) }));

  return NextResponse.json({ page: { ...current, ...update } }, { status: 200 });
}
