import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'settings:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings read access required');
  }

  const db = getFirestore(getAdminApp());
  const docSnap = await db.collection('settings').doc('shipping').get();

  const defaultRates = {
    freeShippingThreshold: 99900, // ₹999
    defaultFlatRate: 9900,       // ₹99
    expressSurcharge: 15000,     // ₹150
    codConvenienceFee: 5000,     // ₹50
    metroDiscountPaise: 0,
    remoteSurchargePaise: 10000, // ₹100
  };

  const rates = docSnap.exists ? { ...defaultRates, ...docSnap.data() } : defaultRates;
  return NextResponse.json({ rates });
}

/**
 * Retired. Shipping is priced state by state (free in the home state, a charge per other state) from the
 * "shipping" settings in Settings > Shipping. The free-above-an-amount and flat-rate figures this endpoint used to
 * write no longer decide any price, so writing them would only mislead; use PUT /api/admin/settings/shipping.
 */
export async function PUT(): Promise<NextResponse> {
  return adminApiError(410, 'conflict', 'Shipping rates are now set per state under Settings > Shipping. This endpoint no longer saves anything.');
}
