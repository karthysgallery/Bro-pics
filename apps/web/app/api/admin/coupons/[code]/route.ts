import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateCouponBodySchema } from '../coupon-request-schema';
import { logger, type Coupon } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ code: string }>;
}

async function checkIdsExist(db: FirebaseFirestore.Firestore, collection: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const refs = ids.map((id) => db.collection(collection).doc(id));
  const snaps = await db.getAll(...refs);
  return snaps.filter((s) => !s.exists).map((s) => s.id);
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { code } = await params;
  const normalizedCode = code.trim().toUpperCase();
  const db = getFirestore(getAdminApp());
  const ref = db.collection('coupons').doc(normalizedCode);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown coupon code: ${normalizedCode}`);
  }
  const current = snap.data() as Coupon;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateCouponBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid coupon body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.categoryIds?.length) {
    const missing = await checkIdsExist(db, 'categories', body.categoryIds);
    if (missing.length > 0) {
      return adminApiError(400, 'invalid_request', `Unknown categoryId(s): ${missing.join(', ')}`);
    }
  }
  if (body.productIds?.length) {
    const missing = await checkIdsExist(db, 'products', body.productIds);
    if (missing.length > 0) {
      return adminApiError(400, 'invalid_request', `Unknown productId(s): ${missing.join(', ')}`);
    }
  }

  const update: Record<string, unknown> = { ...body };
  if (body.startsAt !== undefined) update.startsAt = new Date(body.startsAt);
  if (body.endsAt !== undefined) update.endsAt = new Date(body.endsAt);
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'coupon.update',
    resource: 'coupon',
    resourceId: normalizedCode,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { code: normalizedCode, error: String(error) }));

  return NextResponse.json({ coupon: { ...current, ...update } }, { status: 200 });
}
