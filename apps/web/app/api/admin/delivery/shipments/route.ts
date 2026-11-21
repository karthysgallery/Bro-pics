import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { z } from 'zod';

const READY_STATUSES = ['packed', 'printed_packed'] as const;
const SHIPPED_STATUSES = ['shipped', 'delivered'] as const;

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
  // Real orders only (no sample rows): the ones packed and waiting for a courier, and the ones already handed over.
  // Courier and AWB are saved on the order when staff mark it shipped on the order page.
  const snap = await db
    .collection('orders')
    .where('status', 'in', [...READY_STATUSES, ...SHIPPED_STATUSES])
    .limit(300)
    .get();

  const rows = snap.docs.map((doc) => {
    const o = doc.data() as {
      orderNo?: string;
      status: string;
      total?: number;
      customerName?: string;
      placedAt?: FirebaseFirestore.Timestamp;
      addressJson?: { recipientName?: string; phone?: string; city?: string; state?: string; pincode?: string };
      courier?: string;
      awbNumber?: string;
      shipmentTracking?: { provider?: string; awbNumber?: string; trackingUrl?: string | null; shippedAt?: string; deliveredAt?: string | null };
      hasGlitter?: boolean;
    };
    const a = o.addressJson ?? {};
    return {
      id: doc.id,
      orderNo: o.orderNo ?? doc.id,
      status: o.status,
      total: o.total ?? 0,
      customerName: a.recipientName || o.customerName || null,
      phone: a.phone ?? null,
      destination: [a.city, a.state].filter(Boolean).join(', ') || null,
      pincode: a.pincode ?? null,
      placedAt: o.placedAt?.toDate?.().toISOString() ?? null,
      courier: o.shipmentTracking?.provider ?? o.courier ?? null,
      awb: o.shipmentTracking?.awbNumber ?? o.awbNumber ?? null,
      trackingUrl: o.shipmentTracking?.trackingUrl ?? null,
      shippedAt: o.shipmentTracking?.shippedAt ?? null,
      deliveredAt: o.shipmentTracking?.deliveredAt ?? null,
      hasGlitter: Boolean(o.hasGlitter),
    };
  });

  const byNewest = (a: { placedAt: string | null }, b: { placedAt: string | null }) => (b.placedAt ?? '').localeCompare(a.placedAt ?? '');
  const readyToShip = rows.filter((r) => (READY_STATUSES as readonly string[]).includes(r.status)).sort(byNewest).reverse();
  const shipped = rows
    .filter((r) => (SHIPPED_STATUSES as readonly string[]).includes(r.status))
    .sort((a, b) => (b.shippedAt ?? b.placedAt ?? '').localeCompare(a.shippedAt ?? a.placedAt ?? ''));

  return NextResponse.json({ readyToShip, shipped, truncated: snap.size >= 300 });
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
