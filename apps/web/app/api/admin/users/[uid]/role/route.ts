import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getAdminUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../../lib/rate-limit';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

const VALID_ROLES = ['admin', 'staff'] as const;

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const adminUserId = await getAdminUserIdFromAuthHeader(request);
  if (!adminUserId) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { uid } = await params;
  const body = await request.json();
  const role = body?.role;
  if (role !== null && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'role must be "admin", "staff", or null' }, { status: 400 });
  }

  if (uid === adminUserId && role !== 'admin') {
    return NextResponse.json(
      { error: 'You cannot demote or clear your own admin role' },
      { status: 400 }
    );
  }

  const auth = getAuth(getAdminApp());
  await auth.setCustomUserClaims(uid, role ? { role } : {});
  await auth.revokeRefreshTokens(uid);

  return NextResponse.json({ uid, role }, { status: 200 });
}
