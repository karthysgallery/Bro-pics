import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { AssignCouponBodySchema } from '../../coupon-request-schema';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * [ABE-21] "Assigning a coupon to a customer" — no prior data model
 * existed for this (no `userId` field on `Coupon`, no allocation
 * collection). Kept intentionally minimal: `assignedUserId` lives
 * directly on the coupon doc itself (one coupon → at most one assigned
 * customer at a time), enforced by `calculateCouponDiscount` — the same
 * single choke point `checkout/coupon/validate` and
 * `checkout/create-order` both already go through — rather than a
 * separate many-to-many assignment collection nothing in this codebase
 * needs yet. `userId: null` un-assigns (makes the coupon public again).
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = AssignCouponBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid assign body', { issues: parsed.error.issues });
  }
  const { userId } = parsed.data;

  if (userId) {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown userId: ${userId}`);
    }
  }

  await ref.update({ assignedUserId: userId });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: userId ? 'coupon.assign' : 'coupon.unassign',
    resource: 'coupon',
    resourceId: normalizedCode,
    details: { userId },
  }).catch((error) => logger.error('Failed to write audit log', { code: normalizedCode, error: String(error) }));

  return NextResponse.json({ code: normalizedCode, assignedUserId: userId }, { status: 200 });
}
