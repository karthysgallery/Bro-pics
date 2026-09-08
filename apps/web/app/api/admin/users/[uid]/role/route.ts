import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getAdminUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

const VALID_ROLES = ['admin', 'staff'] as const;

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  await getAuth(getAdminApp()).setCustomUserClaims(uid, role ? { role } : {});

  return NextResponse.json({ uid, role }, { status: 200 });
}
