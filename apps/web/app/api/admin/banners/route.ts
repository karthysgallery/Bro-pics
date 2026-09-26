import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { findCouponByCode } from '../../../../lib/coupon-lookup';
import { CreateBannerBodySchema } from './banner-request-schema';
import { BannerSchema, logger } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateBannerBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid banner body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  if (body.couponCode) {
    const coupon = await findCouponByCode(db, body.couponCode);
    if (!coupon) {
      return adminApiError(400, 'invalid_request', `Unknown coupon code: ${body.couponCode}`);
    }
  }

  const ref = db.collection('banners').doc();
  const banner = BannerSchema.parse({ id: ref.id, ...body });
  await ref.set(banner);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'banner.create',
    resource: 'banner',
    resourceId: ref.id,
    details: { title: body.title, couponCode: body.couponCode },
  }).catch((error) => logger.error('Failed to write audit log', { bannerId: ref.id, error: String(error) }));

  return NextResponse.json({ banner }, { status: 201 });
}
