import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../lib/audit-log';
import { BulkVariantsBodySchema } from '../variant-request-schema';
import { VariantSchema, deriveVariantPrintPixels, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-06] Bulk-CREATE only, up to 100 variants per call — a SKU import,
 * not a partial-update mechanism (use the single-variant PATCH for that).
 * A `batch()`, not a transaction: the writes don't depend on each other,
 * only on the pre-checks (product exists, no SKU collisions) done before
 * the batch is built.
 */
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

  const rawBody = await request.json().catch(() => null);
  const parsed = BulkVariantsBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid bulk variants body', { issues: parsed.error.issues });
  }
  const { variants } = parsed.data;

  const skusInPayload = variants.map((v) => v.sku);
  if (new Set(skusInPayload).size !== skusInPayload.length) {
    return adminApiError(400, 'invalid_request', 'variants contains a duplicate SKU within the same request');
  }

  const variantsRef = db.collection('products').doc(productId).collection('variants');
  const existingSnap = await variantsRef.get();
  const existingSkus = new Set(existingSnap.docs.map((d) => (d.data() as { sku: string }).sku));
  const conflicting = skusInPayload.filter((sku) => existingSkus.has(sku));
  if (conflicting.length > 0) {
    return adminApiError(409, 'conflict', `This product already has variant(s) with SKU(s): ${conflicting.join(', ')}`);
  }

  const batch = db.batch();
  const created = variants.map((body) => {
    const ref = variantsRef.doc();
    const variant = VariantSchema.parse({
      id: ref.id,
      productId,
      ...body,
      aspectRatio: body.widthIn / body.heightIn,
      ...deriveVariantPrintPixels(body.widthIn, body.heightIn),
    });
    batch.set(ref, variant);
    return variant;
  });
  await batch.commit();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'variant.bulk_create',
    resource: 'variant',
    resourceId: productId,
    details: { count: created.length, skus: skusInPayload },
  }).catch((error) => logger.error('Failed to write audit log', { productId, error: String(error) }));

  return NextResponse.json({ variants: created }, { status: 201 });
}
