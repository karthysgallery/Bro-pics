import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { listVersions } from '../../../../../lib/personalization-templates';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Every version of one design, newest first — for the builder's version picker. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');

  const { id } = await params;
  const versions = (await listVersions(getFirestore(getAdminApp()), id)).sort((a, b) => b.version - a.version);
  if (versions.length === 0) return adminApiError(404, 'not_found', `Unknown template: ${id}`);
  return NextResponse.json({ versions }, { status: 200 });
}
