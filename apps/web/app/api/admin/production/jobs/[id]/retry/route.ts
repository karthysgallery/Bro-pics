import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'production:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Production write access required');
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const jobRef = db.collection('printJobs').doc(id);
  const snap = await jobRef.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Print job not found: ${id}`);
  }

  await jobRef.update({
    status: 'queued',
    attempts: 0,
    lastError: null,
    nextAttemptAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'print_job.manual_retry',
    resource: 'print_job',
    resourceId: id,
    details: { previousStatus: snap.data()?.status },
  });

  return NextResponse.json({ success: true, id, status: 'queued' });
}
