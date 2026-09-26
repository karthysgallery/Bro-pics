import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { revalidateProductPage } from '../../../../../../lib/revalidate-catalogue';
import { CreateVariantBodySchema } from './variant-request-schema';
import { VariantSchema, deriveVariantPrintPixels, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id: productId } = await params;
  const db = getFirestore(getAdminApp());
  const productSnap = await db.collection('products').doc(productId).get();
  if (!productSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown product id: ${productId}`);
  }
  const productSlug = (productSnap.data() as { slug: string }).slug;

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateVariantBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid variant body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const variantsRef = db.collection('products').doc(productId).collection('variants');

  // [ABE-06] SKU uniqueness is only enforced WITHIN this product's own
  // variants — a real global (cross-product) uniqueness check would need
  // a collectionGroup query on `sku`, which needs a fieldOverride index
  // this environment can't deploy (same constraint as every other
  // collectionGroup-index gap logged this session). Documented, not
  // silently narrowed: two different products could still share a SKU.
  const skuConflict = await variantsRef.where('sku', '==', body.sku).limit(1).get();
  if (!skuConflict.empty) {
    return adminApiError(409, 'conflict', `This product already has a variant with SKU "${body.sku}"`);
  }

  const ref = variantsRef.doc();
  const variant = VariantSchema.parse({
    id: ref.id,
    productId,
    ...body,
    aspectRatio: body.widthIn / body.heightIn,
    ...deriveVariantPrintPixels(body.widthIn, body.heightIn),
  });

  await ref.set(variant);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'variant.create',
    resource: 'variant',
    resourceId: ref.id,
    details: { productId, sku: body.sku },
  }).catch((error) => logger.error('Failed to write audit log', { variantId: ref.id, error: String(error) }));

  revalidateProductPage(productSlug);

  return NextResponse.json({ variant }, { status: 201 });
}
