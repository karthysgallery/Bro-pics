import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { isValidRole, StaffMirrorSchema, ROLES, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

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
  const adminUserId = permission.uid;

  const { uid } = await params;
  const body = await request.json();
  const role = body?.role;
  if (role !== null && !isValidRole(role)) {
    return NextResponse.json({ error: `role must be one of ${ROLES.join(', ')}, or null` }, { status: 400 });
  }

  // [ABE-01] Generalized from the old "must stay 'admin'" check to "must
  // keep whatever role still grants THIS route's own access" — a
  // super_admin demoting themselves to plain admin is fine (still grants
  // team:manage); demoting themselves to staff or clearing the role
  // entirely would lock them out of role management with no other
  // super_admin/admin necessarily available to undo it.
  if (uid === adminUserId && role !== 'admin' && role !== 'super_admin') {
    return NextResponse.json(
      { error: 'You cannot demote or clear your own admin-tier role' },
      { status: 400 }
    );
  }

  const app = getAdminApp();
  const auth = getAuth(app);
  await auth.setCustomUserClaims(uid, role ? { role } : {});
  await auth.revokeRefreshTokens(uid);

  // [ABE-01] Firestore mirror of the same role — custom claims aren't
  // queryable, so "list every user with role X" (a future team-directory
  // endpoint, ABE-27) needs this. Kept in sync with the claim by writing
  // it in this same route, the only place the claim itself changes.
  const db = getFirestore(app);
  const staffRef = db.collection('staff').doc(uid);
  if (role) {
    const existing = await staffRef.get();
    const existingLastLoginAt = (existing.data() as { lastLoginAt?: FirebaseFirestore.Timestamp } | undefined)?.lastLoginAt;
    const mirror = StaffMirrorSchema.parse({
      uid,
      role,
      active: true,
      invitedBy: adminUserId,
      lastLoginAt: existingLastLoginAt ? existingLastLoginAt.toDate() : null,
      updatedAt: new Date(),
    });
    await staffRef.set(mirror);
  } else {
    // role: null clears access — mark the mirror inactive rather than
    // deleting it, so the "who used to have access" history survives.
    // Only if a mirror already exists: this uid may never have had a
    // role (and therefore no mirror doc) in the first place, in which
    // case there's nothing to deactivate.
    const existing = await staffRef.get();
    if (existing.exists) {
      await staffRef.update({ active: false, updatedAt: new Date() });
    }
  }

  await writeAuditLog(db, {
    actorUid: adminUserId,
    action: 'role.grant',
    resource: 'user',
    resourceId: uid,
    details: { role },
  }).catch((error) => logger.error('Failed to write audit log', { uid, error: String(error) }));

  return NextResponse.json({ uid, role }, { status: 200 });
}
