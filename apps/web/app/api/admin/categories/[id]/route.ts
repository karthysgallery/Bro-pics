import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateCategoryBodySchema } from '../category-request-schema';
import { logger, type Category } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// [ABE-05] "Archive instead of delete" for categories means: no DELETE
// handler here either — deactivating is PATCH {isActive: false}, blocked
// below when the category still has active products.
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('categories').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown category id: ${id}`);
  }
  const current = snap.data() as Category;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateCategoryBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid category body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.slug && body.slug !== current.slug) {
    const slugConflict = await db.collection('categories').where('slug', '==', body.slug).limit(1).get();
    if (!slugConflict.empty && slugConflict.docs[0].id !== id) {
      return adminApiError(409, 'conflict', `A category with slug "${body.slug}" already exists`);
    }
  }

  if (body.parentId) {
    if (body.parentId === id) {
      return adminApiError(400, 'invalid_request', 'A category cannot be its own parent');
    }
    const parentSnap = await db.collection('categories').doc(body.parentId).get();
    if (!parentSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown parentId: ${body.parentId}`);
    }
  }

  // [ABE-05] Block deactivating ("archiving") a category that still has
  // active products in it — a plain two-equality-filter query, no
  // composite index needed (same reasoning as staff/returns' own status
  // filter). Only checked on an actual true->false transition, not on
  // every PATCH that happens to include isActive: true or omits it.
  const isArchiving = body.isActive === false && current.isActive === true;
  if (isArchiving) {
    const activeProducts = await db.collection('products').where('categoryId', '==', id).where('isActive', '==', true).limit(1).get();
    if (!activeProducts.empty) {
      return adminApiError(409, 'conflict', 'Cannot archive a category that still has active products');
    }
  }

  const update: Record<string, unknown> = { ...body };
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: isArchiving ? 'category.archive' : 'category.update',
    resource: 'category',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { categoryId: id, error: String(error) }));

  return NextResponse.json({ category: { ...current, ...update } }, { status: 200 });
}
