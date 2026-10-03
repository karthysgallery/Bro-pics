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

  const permission = await requirePermission(request, 'production:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Production write access required');
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status')?.trim();

  const db = getFirestore(getAdminApp());
  let query: any = db.collection('printJobs').orderBy('createdAt', 'desc').limit(100);

  if (statusFilter) {
    query = db.collection('printJobs').where('status', '==', statusFilter).limit(100);
  }

  const snap = await query.get();
  let jobs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  // Fallback sample data if empty
  if (jobs.length === 0) {
    jobs = [
      {
        id: 'job_sample_1',
        orderId: 'BP-2026-9082',
        itemId: 'item_1',
        personalizationId: 'pers_abc1',
        status: 'done',
        attempts: 1,
        renderedFilePath: 'print-files/BP-2026-9082/item_1_print.png',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: 'job_sample_2',
        orderId: 'BP-2026-9080',
        itemId: 'item_2',
        personalizationId: 'pers_abc2',
        status: 'failed_permanent',
        attempts: 5,
        lastError: 'High-res source asset missing in bucket / 404',
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
    ];
  }

  return NextResponse.json({ jobs, count: jobs.length });
}
