import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { z } from 'zod';

const ManifestRequestSchema = z.object({
  shipmentIds: z.array(z.string().min(1)).min(1).max(200),
  courierId: z.string().min(1),
});

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
  const parsed = ManifestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid manifest request', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const manifestId = `MNF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

  const manifest = {
    id: manifestId,
    courierId: parsed.data.courierId,
    shipmentIds: parsed.data.shipmentIds,
    totalShipments: parsed.data.shipmentIds.length,
    generatedBy: permission.uid,
    createdAt: new Date().toISOString(),
  };

  await db.collection('dispatchManifests').doc(manifestId).set(manifest);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'shipment.generate_manifest',
    resource: 'dispatch_manifest',
    resourceId: manifestId,
    details: manifest,
  });

  return NextResponse.json({ manifest });
}
