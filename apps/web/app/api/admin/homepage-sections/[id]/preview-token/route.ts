import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-17] Issues (or rotates) a random token that lets `GET
 * /api/homepage-sections/preview?token=...` return this section without
 * staff auth and without the `isActive`/`startsAt`/`endsAt` filtering the
 * public homepage applies — so a draft or scheduled section can be shared
 * with a non-staff stakeholder (marketing, the client) before it goes
 * live. Rotating replaces the old token outright: only one token is valid
 * per section at a time, no history of past tokens is kept.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const ref = db.collection('homepageSections').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown homepage section id: ${id}`);
  }

  const previewToken = randomBytes(24).toString('hex');
  await ref.update({ previewToken });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'homepage_section.preview_token_issued',
    resource: 'homepage_section',
    resourceId: id,
  }).catch((error) => logger.error('Failed to write audit log', { sectionId: id, error: String(error) }));

  return NextResponse.json({ previewToken }, { status: 200 });
}

/**
 * Revokes the current preview token (if any) without issuing a new one —
 * e.g. once the stakeholder review is done, or the link leaked.
 */
export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const ref = db.collection('homepageSections').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown homepage section id: ${id}`);
  }

  await ref.update({ previewToken: null });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'homepage_section.preview_token_revoked',
    resource: 'homepage_section',
    resourceId: id,
  }).catch((error) => logger.error('Failed to write audit log', { sectionId: id, error: String(error) }));

  return new NextResponse(null, { status: 204 });
}
