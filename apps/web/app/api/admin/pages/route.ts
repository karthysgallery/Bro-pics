import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { sanitizeRichText } from '../../../../lib/sanitize-rich-text';
import { revalidatePolicyPages } from '../../../../lib/revalidate-pages';
import { CreatePageBodySchema } from './page-request-schema';
import { PageSchema, isLegalSlug, logger, pageStatus } from '@bro-pics/shared';

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
  const parsed = CreatePageBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid page body', { issues: parsed.error.issues });
  }
  const body = parsed.data;
  // A new page always starts as a draft; legal pages are published only after an administrator approves the text.
  if (body.isPublished && isLegalSlug(body.slug)) {
    return adminApiError(409, 'not_publishable', 'A legal page starts as a draft and is published after it is approved');
  }

  const db = getFirestore(getAdminApp());

  // Check-then-write, same documented non-transactional caveat as
  // categories'/products' own slug uniqueness checks (ABE-04/ABE-05).
  const slugConflict = await db.collection('pages').where('slug', '==', body.slug).limit(1).get();
  if (!slugConflict.empty) {
    return adminApiError(409, 'conflict', `A page with slug "${body.slug}" already exists`);
  }

  const ref = db.collection('pages').doc();
  const page = PageSchema.parse({
    id: ref.id,
    ...body,
    bodyHtml: sanitizeRichText(body.bodyHtml),
    updatedAt: new Date(),
    updatedBy: permission.uid,
  });
  await ref.set(page);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'page.create',
    resource: 'page',
    resourceId: ref.id,
    details: { slug: body.slug },
  }).catch((error) => logger.error('Failed to write audit log', { pageId: ref.id, error: String(error) }));

  revalidatePolicyPages(page.slug);
  return NextResponse.json({ page }, { status: 201 });
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
  const snapshot = await db.collection('pages').get();
  // `status` is derived for the admin: draft, approved (signed off, not live) or published (live).
  const pages = snapshot.docs.map((doc) => {
    const d = doc.data() as { slug: string; bodyHtml: string; isPublished: boolean; approvedHash?: string };
    return { ...d, status: pageStatus({ slug: d.slug, bodyHtml: d.bodyHtml ?? '', isPublished: d.isPublished === true, approvedHash: d.approvedHash }) };
  });

  return NextResponse.json({ pages }, { status: 200 });
}

