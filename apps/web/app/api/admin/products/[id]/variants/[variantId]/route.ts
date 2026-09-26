import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../lib/audit-log';
import { revalidateProductPage } from '../../../../../../../lib/revalidate-catalogue';
import { UpdateVariantBodySchema } from '../variant-request-schema';
import { deriveVariantPrintPixels, logger, type Variant } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; variantId: string }>;
}

// [ABE-06] No DELETE handler — `isActive: false` (already supported by
// this PATCH) is how a variant is retired without breaking any order or
// print job that references its id, same "archive instead of delete"
// reasoning as products/categories.
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

  const { id: productId, variantId } = await params;
  const db = getFirestore(getAdminApp());
  const variantsRef = db.collection('products').doc(productId).collection('variants');
  const ref = variantsRef.doc(variantId);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown variant id: ${variantId}`);
  }
  const current = snap.data() as Variant;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateVariantBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid variant body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.sku && body.sku !== current.sku) {
    const skuConflict = await variantsRef.where('sku', '==', body.sku).limit(1).get();
    if (!skuConflict.empty && skuConflict.docs[0].id !== variantId) {
      return adminApiError(409, 'conflict', `This product already has a variant with SKU "${body.sku}"`);
    }
  }

  const update: Record<string, unknown> = { ...body };
  if (body.widthIn || body.heightIn) {
    const widthIn = body.widthIn ?? current.widthIn;
    const heightIn = body.heightIn ?? current.heightIn;
    update.aspectRatio = widthIn / heightIn;
    Object.assign(update, deriveVariantPrintPixels(widthIn, heightIn));
  }

  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'variant.update',
    resource: 'variant',
    resourceId: variantId,
    details: { productId, changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { variantId, error: String(error) }));

  // A price/stock-status/size change on any variant affects the parent
  // product's detail page (price range, size options) — one extra read
  // for the slug, worth it since this route doesn't otherwise know it.
  const productSnap = await db.collection('products').doc(productId).get();
  if (productSnap.exists) {
    revalidateProductPage((productSnap.data() as { slug: string }).slug);
  }

  return NextResponse.json({ variant: { ...current, ...update } }, { status: 200 });
}
