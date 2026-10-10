import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requirePermission } from '../../../../../lib/require-permission';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { resetMfa } from '../../../../../lib/security/admin-mfa';
import { audit } from '../../../../../lib/security/mfa-route';

/**
 * Removes a team member's authenticator (lost or changed phone). Only someone who manages the team — and has
 * passed their own authenticator step — can do it; the member sets up a new app at their next sign-in.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const permission = await requirePermission(request, 'team:manage');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Team management access required');
  const body = (await request.json().catch(() => null)) as { uid?: unknown } | null;
  const uid = typeof body?.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return adminApiError(400, 'invalid_request', 'Choose the team member to reset.');
  const db = getFirestore(getAdminApp());
  await resetMfa(db, uid);
  await audit(db, permission.uid, 'mfa.reset', { target: uid });
  return NextResponse.json({ ok: true });
}
