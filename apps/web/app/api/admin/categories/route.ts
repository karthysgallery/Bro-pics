import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { revalidateHomepage, revalidateCategoryPage } from '../../../../lib/revalidate-catalogue';
import { CreateCategoryBodySchema } from './category-request-schema';
import { CategorySchema, logger } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) {
    return adminApiError(
      permission.status,
      permission.status === 401 ? 'unauthenticated' : 'forbidden',
      'Catalogue read access required'
    );
  }

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('categories').orderBy('sortOrder', 'asc').get();
  const categories = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));

  return NextResponse.json({ categories }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateCategoryBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid category body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  // Check-then-write, same documented non-transactional caveat as
  // products' own slug uniqueness check (ABE-04) — a plain equality
  // query needs no composite index, but Firestore can't enforce
  // uniqueness on a non-ID field.
  const slugConflict = await db.collection('categories').where('slug', '==', body.slug).limit(1).get();
  if (!slugConflict.empty) {
    return adminApiError(409, 'conflict', `A category with slug "${body.slug}" already exists`);
  }

  if (body.parentId) {
    const parentSnap = await db.collection('categories').doc(body.parentId).get();
    if (!parentSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown parentId: ${body.parentId}`);
    }
  }

  const ref = db.collection('categories').doc();
  const category = CategorySchema.parse({ id: ref.id, ...body });
  await ref.set(category);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'category.create',
    resource: 'category',
    resourceId: ref.id,
    details: { slug: body.slug },
  }).catch((error) => logger.error('Failed to write audit log', { categoryId: ref.id, error: String(error) }));

  revalidateCategoryPage(body.slug);
  revalidateHomepage();

  return NextResponse.json({ category }, { status: 201 });
}
