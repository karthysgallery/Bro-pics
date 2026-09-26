import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { ReorderCategoriesBodySchema } from '../category-request-schema';
import { logger } from '@bro-pics/shared';

/**
 * [ABE-05] `orderedIds` is the category IDs in their new display order;
 * `sortOrder` for each is just its index in that array. A `batch()` (not
 * a transaction — no read this write depends on) is the right primitive
 * for "N independent writes, all-or-nothing," same as this app already
 * uses set-with-merge elsewhere for a single denormalization write.
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
  const parsed = ReorderCategoriesBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid reorder body', { issues: parsed.error.issues });
  }
  const { orderedIds } = parsed.data;

  if (new Set(orderedIds).size !== orderedIds.length) {
    return adminApiError(400, 'invalid_request', 'orderedIds contains a duplicate category id');
  }

  const db = getFirestore(getAdminApp());
  const refs = orderedIds.map((id) => db.collection('categories').doc(id));
  const snaps = await db.getAll(...refs);
  const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
  if (missing.length > 0) {
    return adminApiError(400, 'invalid_request', `Unknown category id(s): ${missing.join(', ')}`);
  }

  const batch = db.batch();
  orderedIds.forEach((id, index) => {
    batch.update(db.collection('categories').doc(id), { sortOrder: index });
  });
  await batch.commit();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'category.reorder',
    resource: 'category',
    resourceId: orderedIds.join(','),
    details: { orderedIds },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  return NextResponse.json({ orderedIds }, { status: 200 });
}
