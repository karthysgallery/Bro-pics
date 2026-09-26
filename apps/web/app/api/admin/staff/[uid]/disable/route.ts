import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

/**
 * [ABE-27] Distinct from POST /api/admin/users/[uid]/role's `role: null`
 * path — clearing the role only removes STAFF privileges (the account
 * can still sign in as an ordinary customer); this blocks sign-in
 * entirely via `auth.updateUser({disabled})`, for e.g. an employee who
 * left and shouldn't be able to log in at all, not just lose admin
 * access. Mirrors `staff/{uid}.active` to match (reusing the same field
 * `role: null` already sets false on, so either path leaves the mirror
 * consistent with "is this currently a usable staff account").
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'team:manage');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Admin access required' }, { status: permission.status });
  }

  const { uid } = await params;
  if (uid === permission.uid) {
    return NextResponse.json({ error: 'You cannot disable your own account' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.disabled !== 'boolean') {
    return NextResponse.json({ error: 'disabled must be a boolean' }, { status: 400 });
  }
  const { disabled } = body;

  const app = getAdminApp();
  await getAuth(app).updateUser(uid, { disabled });
  if (disabled) {
    await getAuth(app).revokeRefreshTokens(uid);
  }

  const db = getFirestore(app);
  const staffRef = db.collection('staff').doc(uid);
  const staffSnap = await staffRef.get();
  if (staffSnap.exists) {
    await staffRef.update({ active: !disabled, updatedAt: new Date() });
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: disabled ? 'staff.disable' : 'staff.enable',
    resource: 'user',
    resourceId: uid,
  }).catch((error) => logger.error('Failed to write audit log', { uid, error: String(error) }));

  return NextResponse.json({ uid, disabled }, { status: 200 });
}
