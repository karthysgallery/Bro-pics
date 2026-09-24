import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { findCouponByCode } from '../../../../../lib/coupon-lookup';
import { UpdateBannerBodySchema } from '../banner-request-schema';
import { logger, type Banner } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('banners').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown banner id: ${id}`);
  }
  const current = snap.data() as Banner;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateBannerBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid banner body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.couponCode) {
    const coupon = await findCouponByCode(db, body.couponCode);
    if (!coupon) {
      return adminApiError(400, 'invalid_request', `Unknown coupon code: ${body.couponCode}`);
    }
  }

  const update: Record<string, unknown> = { ...body };
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'banner.update',
    resource: 'banner',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { bannerId: id, error: String(error) }));

  return NextResponse.json({ banner: { ...current, ...update } }, { status: 200 });
}
