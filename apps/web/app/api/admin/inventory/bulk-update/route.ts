import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { revalidateHomepage } from '../../../../../lib/revalidate-catalogue';
import { BulkInventoryUpdateBodySchema } from './inventory-request-schema';
import { logger } from '@bro-pics/shared';

/**
 * [ABE-08] Bulk stock-state update across variants, potentially spanning
 * many products in one call (e.g. "mark these 40 SKUs out of stock" after
 * a supplier update) — the reason this isn't just repeated calls to
 * ABE-06's per-variant PATCH. Writing `stockStatus` alone is enough: the
 * existing `onVariantWritten` trigger (functions/src/products/
 * denormalize.ts) already recomputes each affected product's
 * `inStock`/`availableSizes` etc. from its variants whenever any variant
 * write fires, admin-write or otherwise — nothing here needs to touch
 * `products` docs directly.
 */
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
  const parsed = BulkInventoryUpdateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid inventory bulk-update body', { issues: parsed.error.issues });
  }
  const { updates } = parsed.data;

  const db = getFirestore(getAdminApp());
  const refs = updates.map((u) => db.collection('products').doc(u.productId).collection('variants').doc(u.variantId));
  const snaps = await db.getAll(...refs);
  const missing = updates.filter((_, i) => !snaps[i].exists).map((u) => `${u.productId}/${u.variantId}`);
  if (missing.length > 0) {
    return adminApiError(400, 'invalid_request', `Unknown product/variant id pair(s): ${missing.join(', ')}`);
  }

  const batch = db.batch();
  refs.forEach((ref, i) => {
    batch.update(ref, { stockStatus: updates[i].stockStatus });
  });
  await batch.commit();

  const countByStatus = updates.reduce<Record<string, number>>((acc, u) => {
    acc[u.stockStatus] = (acc[u.stockStatus] ?? 0) + 1;
    return acc;
  }, {});

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'inventory.bulk_update',
    resource: 'variant',
    resourceId: updates.map((u) => u.variantId).join(','),
    details: { count: updates.length, countByStatus },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  // [ABE-09] Revalidates only the homepage/listing-level ISR, not each
  // affected product's own page — doing that would need a slug lookup
  // per distinct productId in the batch (up to 200 extra reads for a
  // bulk endpoint meant to be cheap). Individual product pages still
  // pick up the stock-status change within the existing 60s ISR window;
  // accepted narrowing for a bulk-only endpoint, not silently dropped.
  revalidateHomepage();

  return NextResponse.json({ updated: updates.length }, { status: 200 });
}
