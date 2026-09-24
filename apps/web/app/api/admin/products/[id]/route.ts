import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateProductBodySchema } from '../product-request-schema';
import { buildProductSearchFields, logger, type Product } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// [ABE-04] "Archive instead of delete" — there is no DELETE handler here.
// Archiving is just PATCH { status: 'archived' }, same endpoint as every
// other field change, so there's no separate destructive code path to
// guard.
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
  const ref = db.collection('products').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown product id: ${id}`);
  }
  const current = snap.data() as Product;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateProductBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid product body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.slug && body.slug !== current.slug) {
    const slugConflict = await db.collection('products').where('slug', '==', body.slug).limit(1).get();
    if (!slugConflict.empty && slugConflict.docs[0].id !== id) {
      return adminApiError(409, 'conflict', `A product with slug "${body.slug}" already exists`);
    }
  }

  if (body.categoryId && body.categoryId !== current.categoryId) {
    const categorySnap = await db.collection('categories').doc(body.categoryId).get();
    if (!categorySnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown categoryId: ${body.categoryId}`);
    }
  }

  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.status) {
    update.isActive = body.status === 'published';
  }
  // Recompute the search fields whenever the inputs they're derived from
  // change — otherwise a retitled product keeps stale titleLower/
  // searchTokens and silently falls out of (or wrongly stays in) search.
  if (body.title || body.shortDesc) {
    Object.assign(
      update,
      buildProductSearchFields(body.title ?? current.title, body.shortDesc ?? current.shortDesc)
    );
  }

  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: body.status === 'archived' ? 'product.archive' : 'product.update',
    resource: 'product',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { productId: id, error: String(error) }));

  return NextResponse.json({ product: { ...current, ...update } }, { status: 200 });
}
