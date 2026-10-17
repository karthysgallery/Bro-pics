import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { sanitizeRichText } from '../../../../../lib/sanitize-rich-text';
import { revalidatePolicyPages } from '../../../../../lib/revalidate-pages';
import { UpdatePageBodySchema } from '../page-request-schema';
import { loadLegalValues } from '../../../../../lib/legal-values';
import { fillLegalTokens, isApproved, isLegalSlug, logger, publicationBlockers, type Page } from '@bro-pics/shared';

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
  const nextSlug = body.slug ?? current.slug;
  const nextBody = (update.bodyHtml as string | undefined) ?? current.bodyHtml;
  const nextPublished = body.isPublished ?? current.isPublished;
  const legal = isLegalSlug(nextSlug);
  // Editing a legal page voids its approval, so it also stops being public until it is approved again.
  if (legal && nextBody !== current.bodyHtml && current.isPublished) update.isPublished = false;
  if (nextPublished && update.isPublished !== false) {
    // Nothing unfinished is ever published: internal notes and (for legal pages) missing business facts block it,
    // and a legal page needs the owner's approval of this exact text.
    const filled = fillLegalTokens(nextBody, await loadLegalValues());
    const blockers = legal ? publicationBlockers(filled) : publicationBlockers(filled).filter((b) => !b.startsWith('Missing business details') && !b.includes('almost no text'));
    if (legal && !isApproved({ bodyHtml: nextBody, approvedHash: current.approvedHash })) blockers.push('This text has not been approved by an administrator');
    if (blockers.length > 0) {
      return adminApiError(409, 'not_publishable', 'This page cannot be published yet', { blockers });
    }
  }
  update.updatedBy = permission.uid;
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'page.update',
    resource: 'page',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { pageId: id, error: String(error) }));

  revalidatePolicyPages(current.slug);
  if (update.slug && update.slug !== current.slug) revalidatePolicyPages(update.slug as string);
  return NextResponse.json({ page: { ...current, ...update } }, { status: 200 });
}
