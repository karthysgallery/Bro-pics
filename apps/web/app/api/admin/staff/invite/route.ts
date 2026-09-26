import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { CreateStaffInviteBodySchema } from './invite-request-schema';
import { StaffInviteSchema, logger } from '@bro-pics/shared';

const INVITE_EXPIRY_DAYS = 7;

/**
 * [ABE-27] No email/SMS send pipeline exists yet to deliver this
 * automatically (see BE-28/29's still-unbuilt notificationOutbox
 * worker — ABE-25's own PROJECT_STATUS note confirms it's a pure,
 * unconsumed queue today) — the token/link this returns is meant to be
 * shared by hand (copy-paste, an existing chat channel) until that
 * pipeline exists. The invite itself is fully functional: whoever holds
 * the token can redeem it via POST /api/staff/invite/accept once
 * they've signed in with their own account.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateStaffInviteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invite body', issues: parsed.error.issues }, { status: 400 });
  }
  const { email, role } = parsed.data;

  const db = getFirestore(getAdminApp());
  const token = randomBytes(24).toString('hex');
  const now = new Date();
  const invite = StaffInviteSchema.parse({
    id: token,
    email,
    role,
    status: 'pending',
    invitedBy: permission.uid,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    acceptedBy: null,
    acceptedAt: null,
  });
  await db.collection('staffInvites').doc(token).set(invite);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'staff.invite',
    resource: 'staff_invite',
    resourceId: token,
    details: { email, role },
  }).catch((error) => logger.error('Failed to write audit log', { token, error: String(error) }));

  return NextResponse.json({ token, email, role, expiresAt: invite.expiresAt }, { status: 201 });
}
