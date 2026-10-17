import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { revalidatePolicyPages } from '../../../../../../lib/revalidate-pages';
import { loadLegalValues } from '../../../../../../lib/legal-values';
import { fillLegalTokens, isLegalSlug, logger, publicationBlockers, textFingerprint, type Page } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Owner sign-off for a legal/policy page. Stricter than editing (policies:approve, held by super_admin and admin only; content and settings staff cannot do
 * it): the text must be complete (every {{fact}} filled from the saved settings, no internal notes left) and the
 * approval is bound to this exact text. Editing the page afterwards voids it. Publishing is a separate step.
 * DELETE withdraws an approval (and the page stops being public).
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'policies:approve');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Only an administrator can approve a legal page');
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('pages').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', `Unknown page id: ${id}`);
  const page = snap.data() as Page;
  if (!isLegalSlug(page.slug)) return adminApiError(400, 'invalid_request', 'Only legal and policy pages need approval');

  const filled = fillLegalTokens(page.bodyHtml, await loadLegalValues());
  const blockers = publicationBlockers(filled);
  if (blockers.length > 0) {
    return adminApiError(409, 'not_publishable', 'This page cannot be approved yet', { blockers });
  }

  await ref.update({ approvedHash: textFingerprint(page.bodyHtml), approvedBy: permission.uid, approvedAt: new Date(), updatedAt: new Date() });
  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'page.approve',
    resource: 'page',
    resourceId: id,
    details: { slug: page.slug },
  }).catch((error) => logger.error('Failed to write audit log', { pageId: id, error: String(error) }));
  revalidatePolicyPages(page.slug);
  return NextResponse.json({ approved: true, slug: page.slug }, { status: 200 });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const permission = await requirePermission(request, 'policies:approve');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Only an administrator can withdraw an approval');
  }
  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('pages').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', `Unknown page id: ${id}`);
  const { FieldValue } = await import('firebase-admin/firestore');
  await ref.update({ approvedHash: FieldValue.delete(), approvedBy: FieldValue.delete(), approvedAt: FieldValue.delete(), isPublished: false, updatedAt: new Date() });
  await writeAuditLog(db, { actorUid: permission.uid, action: 'page.unapprove', resource: 'page', resourceId: id, details: { slug: (snap.data() as Page).slug } }).catch((error) => logger.error('Failed to write audit log', { pageId: id, error: String(error) }));
  revalidatePolicyPages((snap.data() as Page).slug);
  return NextResponse.json({ approved: false }, { status: 200 });
}
