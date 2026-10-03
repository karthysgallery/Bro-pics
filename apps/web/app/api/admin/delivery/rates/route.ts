import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { z } from 'zod';

const ShippingRatesSchema = z.object({
  freeShippingThreshold: z.number().int().min(0), // in paise (e.g., 99900 = ₹999)
  defaultFlatRate: z.number().int().min(0),       // in paise (e.g., 9900 = ₹99)
  expressSurcharge: z.number().int().min(0),      // in paise (e.g., 15000 = ₹150)
  codConvenienceFee: z.number().int().min(0),     // in paise (e.g., 5000 = ₹50)
  metroDiscountPaise: z.number().int().min(0).default(0),
  remoteSurchargePaise: z.number().int().min(0).default(10000),
});

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

export async function PUT(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'shipping:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Shipping write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = ShippingRatesSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid shipping rates structure', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection('settings').doc('shipping');
  const beforeSnap = await ref.get();
  const before = beforeSnap.exists ? beforeSnap.data() : null;

  await ref.set({
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'shipping.update_rates',
    resource: 'settings',
    resourceId: 'shipping',
    details: { before, after: parsed.data },
  });

  return NextResponse.json({ rates: parsed.data, success: true });
}
