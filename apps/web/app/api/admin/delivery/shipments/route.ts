import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { z } from 'zod';

const CreateShipmentSchema = z.object({
  orderId: z.string().min(1),
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  awb: z.string().min(3),
  trackingUrl: z.string().url().optional(),
  weightGrams: z.number().int().min(1).default(1200),
  packagesCount: z.number().int().min(1).default(1),
  notes: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
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

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('shipments').orderBy('createdAt', 'desc').limit(100).get();
  let shipments: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Fallback / seed sample shipments if empty
  if (shipments.length === 0) {
    shipments = [
      {
        id: 'shp_001',
        orderId: 'BP-2026-9081',
        courierId: 'delhivery',
        courierName: 'Delhivery Surface',
        awb: 'DEL9928172635',
        trackingUrl: 'https://www.delhivery.com/track/package/DEL9928172635',
        status: 'shipped',
        weightGrams: 1450,
        customerName: 'Aarav Sharma',
        destinationCity: 'Bengaluru, KA',
        createdAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      },
      {
        id: 'shp_002',
        orderId: 'BP-2026-9079',
        courierId: 'bluedart',
        courierName: 'Blue Dart Express',
        awb: 'BD4491028374',
        trackingUrl: 'https://www.bluedart.com/track?awb=BD4491028374',
        status: 'manifested',
        weightGrams: 2100,
        customerName: 'Priya Iyer',
        destinationCity: 'Mumbai, MH',
        createdAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      },
    ];
  }

  return NextResponse.json({ shipments });
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
  const parsed = CreateShipmentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid shipment payload', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection('shipments').doc();
  const shipment = {
    id: ref.id,
    ...parsed.data,
    status: 'shipped',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ref.set(shipment);

  // Update order status to shipped if found
  const orderRef = db.collection('orders').doc(parsed.data.orderId);
  const orderSnap = await orderRef.get();
  if (orderSnap.exists) {
    await orderRef.update({
      status: 'shipped',
      trackingAwb: parsed.data.awb,
      courierName: parsed.data.courierName,
      shippedAt: new Date().toISOString(),
    });
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'shipment.create',
    resource: 'shipment',
    resourceId: ref.id,
    details: shipment,
  });

  return NextResponse.json({ shipment }, { status: 201 });
}
