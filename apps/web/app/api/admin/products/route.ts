import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { CreateProductBodySchema } from './product-request-schema';
import { ProductSchema, buildProductSearchFields, logger } from '@bro-pics/shared';

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
  const parsed = CreateProductBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid product body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  // Firestore can't enforce uniqueness on a non-ID field — this is a
  // check-then-write, not a transactional constraint. A genuine race (two
  // admins creating the same slug within milliseconds of each other) could
  // still both pass this check; accepted for a low-concurrency, staff-only
  // action, same category of gap as the returns-refund race documented in
  // ABE-03. The real fix would be making slug the doc ID, which would
  // break every existing product's ID — not worth it for this.
  const slugConflict = await db.collection('products').where('slug', '==', body.slug).limit(1).get();
  if (!slugConflict.empty) {
    return adminApiError(409, 'conflict', `A product with slug "${body.slug}" already exists`);
  }

  const categorySnap = await db.collection('categories').doc(body.categoryId).get();
  if (!categorySnap.exists) {
    return adminApiError(400, 'invalid_request', `Unknown categoryId: ${body.categoryId}`);
  }

  const ref = db.collection('products').doc();
  const now = new Date();
  const product = ProductSchema.parse({
    id: ref.id,
    ...body,
    isActive: body.status === 'published',
    createdAt: now,
    updatedAt: now,
    // Cloud-Function-owned denormalized fields — no variant or media
    // exists yet on a freshly created product, so these start at their
    // safe zero-value and the existing onVariantWritten/media triggers
    // (functions/src/products/denormalize*.ts) take over once variants/
    // media are added (ABE-06/ABE-10, not yet built).
    availableSizes: [],
    availableColours: [],
    availableMaterials: [],
    minPrice: 0,
    maxPrice: 0,
    occasionTags: [],
    inStock: false,
    ratingAverage: 0,
    ratingCount: 0,
    ...buildProductSearchFields(body.title, body.shortDesc),
    primaryImageUrl: '',
    hoverImageUrl: null,
  });

  await ref.set(product);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'product.create',
    resource: 'product',
    resourceId: ref.id,
    details: { slug: body.slug, status: body.status },
  }).catch((error) => logger.error('Failed to write audit log', { productId: ref.id, error: String(error) }));

  return NextResponse.json({ product }, { status: 201 });
}
