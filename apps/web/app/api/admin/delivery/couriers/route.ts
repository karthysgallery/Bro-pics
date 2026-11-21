import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { z } from 'zod';

const CourierSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  trackingUrlTemplate: z.string().url(), // e.g. https://www.delhivery.com/track/package/{awb}
  isActive: z.boolean().default(true),
  defaultForZones: z.array(z.enum(['metro', 'standard', 'remote'])).default([]),
  contactPhone: z.string().optional(),
  apiEnabled: z.boolean().default(false),
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
  const snap = await db.collection('couriers').get();
  const couriers: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Common Indian couriers offered as one-click additions. They are NOT saved couriers until staff add one
  // (earlier these were returned as if saved, so Edit/Delete on them failed).
  const savedCodes = new Set(couriers.map((c) => String(c.code ?? '').toUpperCase()));
  const suggestions = [
    {
      id: 'delhivery',
      name: 'Delhivery Surface & Express',
      code: 'DELHIVERY',
      trackingUrlTemplate: 'https://www.delhivery.com/track/package/{awb}',
      isActive: true,
      defaultForZones: ['metro', 'standard'],
      apiEnabled: false,
    },
    {
      id: 'bluedart',
      name: 'Blue Dart Express',
      code: 'BLUEDART',
      trackingUrlTemplate: 'https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={awb}',
      isActive: true,
      defaultForZones: ['metro'],
      apiEnabled: false,
    },
    {
      id: 'indiapost',
      name: 'India Post Speed Post',
      code: 'INDIAPOST',
      trackingUrlTemplate: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consignmentNo={awb}',
      isActive: true,
      defaultForZones: ['remote'],
      apiEnabled: false,
    },
    {
      id: 'xpressbees',
      name: 'Xpressbees Logistics',
      code: 'XPRESSBEES',
      trackingUrlTemplate: 'https://www.xpressbees.com/track?awb={awb}',
      isActive: true,
      defaultForZones: ['standard'],
      apiEnabled: false,
    },
  ];

  return NextResponse.json({ couriers, suggestions: suggestions.filter((c) => !savedCodes.has(c.code)) });
}

export async function POST(request: Request): Promise<NextResponse> {
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
  const parsed = CourierSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid courier payload', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection('couriers').doc();
  const courier = {
    id: ref.id,
    ...parsed.data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ref.set(courier);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'courier.create',
    resource: 'courier',
    resourceId: ref.id,
    details: courier,
  });

  return NextResponse.json({ courier }, { status: 201 });
}
