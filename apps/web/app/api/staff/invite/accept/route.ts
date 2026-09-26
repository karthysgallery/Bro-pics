import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { AcceptStaffInviteBodySchema } from '../../../admin/staff/invite/invite-request-schema';
import { StaffMirrorSchema, logger } from '@bro-pics/shared';

/**
 * [ABE-27] Self-service, not `requirePermission` — the whole point is
 * granting staff access to someone who doesn't have it yet, so an
 * admin-only gate would be circular. The caller just needs to already be
 * signed in (any account, any role) with their own Firebase Auth account
 * — the token is what actually authorizes the grant, not the caller's
 * current role. Sets the custom claim + Firestore mirror the exact same
 * way POST /api/admin/users/[uid]/role does, so the two paths to "this
 * uid is staff" never drift.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = AcceptStaffInviteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid accept body' }, { status: 400 });
  }
  const { token } = parsed.data;

  const app = getAdminApp();
  const db = getFirestore(app);
  const inviteRef = db.collection('staffInvites').doc(token);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    return NextResponse.json({ error: 'Unknown or invalid invite token' }, { status: 404 });
  }
  const invite = inviteSnap.data() as {
    email: string;
    role: string;
    status: string;
    invitedBy: string;
    expiresAt: FirebaseFirestore.Timestamp;
  };

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is already ${invite.status}` }, { status: 409 });
  }
  if (invite.expiresAt.toDate() < new Date()) {
    await inviteRef.update({ status: 'expired' });
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
  }

  // Soft email check — only enforced when the caller's own account has an
  // email set at all (a phone-only signup may not), so this can't lock out
  // a legitimate invitee who signed up with phone/OTP instead of email.
  const authUser = await getAuth(app).getUser(userId);
  if (authUser.email && authUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({ error: 'This invite was issued to a different email address' }, { status: 403 });
  }

  await getAuth(app).setCustomUserClaims(userId, { role: invite.role });
  await getAuth(app).revokeRefreshTokens(userId);

  const staffRef = db.collection('staff').doc(userId);
  const mirror = StaffMirrorSchema.parse({
    uid: userId,
    role: invite.role,
    active: true,
    invitedBy: invite.invitedBy,
    lastLoginAt: null,
    updatedAt: new Date(),
  });
  await staffRef.set(mirror);

  await inviteRef.update({ status: 'accepted', acceptedBy: userId, acceptedAt: new Date() });

  await writeAuditLog(db, {
    actorUid: userId,
    action: 'staff.invite_accept',
    resource: 'staff_invite',
    resourceId: token,
    details: { role: invite.role },
  }).catch((error) => logger.error('Failed to write audit log', { token, error: String(error) }));

  return NextResponse.json({ uid: userId, role: invite.role }, { status: 200 });
}
