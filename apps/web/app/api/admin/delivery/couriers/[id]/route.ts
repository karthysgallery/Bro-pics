import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateCourierSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  trackingUrlTemplate: z.string().url().optional(),
  isActive: z.boolean().optional(),
  defaultForZones: z.array(z.enum(['metro', 'standard', 'remote'])).optional(),
  contactPhone: z.string().optional(),
  apiEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateCourierSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid courier update payload', { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection('couriers').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown courier: ${id}`);
  }

  const before = snap.data();
  const updated = {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };

  await ref.update(updated);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'courier.update',
    resource: 'courier',
    resourceId: id,
    details: { before, after: updated },
  });

  return NextResponse.json({ courier: { id, ...before, ...updated } });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('couriers').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown courier: ${id}`);
  }

  await ref.delete();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'courier.delete',
    resource: 'courier',
    resourceId: id,
    details: snap.data(),
  });

  return NextResponse.json({ success: true, id });
}
