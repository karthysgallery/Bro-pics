import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { CreateCouponBodySchema } from './coupon-request-schema';
import { CouponSchema, logger } from '@bro-pics/shared';

const LIST_LIMIT = 200;

async function checkIdsExist(db: FirebaseFirestore.Firestore, collection: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const refs = ids.map((id) => db.collection(collection).doc(id));
  const snaps = await db.getAll(...refs);
  return snaps.filter((s) => !s.exists).map((s) => s.id);
}

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
  const parsed = CreateCouponBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid coupon body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

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

  // Coupon codes are their own Firestore doc id (coupons/{code}), same
  // normalization lib/coupon-lookup.ts's findCouponByCode already uses —
  // trim + uppercase, so "save10" and "SAVE10" are the same coupon.
  const normalizedCode = body.code.trim().toUpperCase();
  const ref = db.collection('coupons').doc(normalizedCode);
  const existing = await ref.get();
  if (existing.exists) {
    return adminApiError(409, 'conflict', `A coupon with code "${normalizedCode}" already exists`);
  }

  const { code: _code, ...rest } = body;
  const coupon = CouponSchema.parse({
    ...rest,
    code: normalizedCode,
    startsAt: new Date(body.startsAt),
    endsAt: new Date(body.endsAt),
    usedCount: 0,
  });
  await ref.set(coupon);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'coupon.create',
    resource: 'coupon',
    resourceId: normalizedCode,
    details: { type: body.type, value: body.value },
  }).catch((error) => logger.error('Failed to write audit log', { code: normalizedCode, error: String(error) }));

  return NextResponse.json({ coupon }, { status: 201 });
}

/**
 * [ABE-21] "usage stats" is satisfied by simply returning the full coupon
 * doc — `usedCount` already lives on it, incremented atomically by the
 * payment-captured webhook, so there's nothing separate to compute here.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content read access required');
  }

  const url = new URL(request.url);
  const isActive = url.searchParams.get('isActive');

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('coupons');
  if (isActive === 'true' || isActive === 'false') {
    // A coupon seeded before this field existed (no admin CRUD write has
    // ever touched it) has no `isActive` field at all — an equality
    // filter can't match "field absent" together with "== true" in one
    // query, so `?isActive=true` only returns coupons this API has
    // actually written. Acceptable: every coupon created through this
    // route always gets the field (defaults to true).
    query = query.where('isActive', '==', isActive === 'true');
  }

  const snapshot = await query.limit(LIST_LIMIT).get();
  const coupons = snapshot.docs.map((doc) => doc.data());

  return NextResponse.json({ coupons }, { status: 200 });
}
