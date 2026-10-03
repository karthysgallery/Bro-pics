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

  const permission = await requirePermission(request, 'audit:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Audit log read access required');
  }

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(500).get();
  const logs = snap.docs.map((d) => d.data());

  const headers = ['ID', 'Actor UID', 'Action', 'Resource', 'Resource ID', 'Created At', 'Details'];
  const rows = logs.map((l: any) => [
    `"${l.id || ''}"`,
    `"${l.actorUid || ''}"`,
    `"${l.action || ''}"`,
    `"${l.resource || ''}"`,
    `"${l.resourceId || ''}"`,
    `"${l.createdAt || ''}"`,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
