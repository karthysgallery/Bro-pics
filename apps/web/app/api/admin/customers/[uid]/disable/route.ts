import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { DisableCustomerBodySchema } from '../../customer-request-schema';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

/**
 * [ABE-26] Mirrors the role route's shape: Firebase Auth is the source
 * of truth (`auth.updateUser({disabled})` — this is what actually blocks
 * sign-in), `revokeRefreshTokens` ends any live session immediately on
 * disable (not on re-enable — nothing to revoke there), and the
 * Firestore `users/{uid}.disabled` flag is a queryable mirror, same
 * "custom claims/auth flags aren't queryable, Firestore is" reasoning
 * the role route's own comment gives for its `staff/{uid}` mirror.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'customers:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Customer write access required');
  }

  const { uid } = await params;
  if (uid === permission.uid) {
    return adminApiError(400, 'invalid_request', 'You cannot disable your own account');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = DisableCustomerBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid disable body', { issues: parsed.error.issues });
  }
  const { disabled } = parsed.data;

  const app = getAdminApp();
  const db = getFirestore(app);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown customer id: ${uid}`);
  }

  await getAuth(app).updateUser(uid, { disabled });
  if (disabled) {
    await getAuth(app).revokeRefreshTokens(uid);
  }
  await userRef.update({ disabled });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: disabled ? 'customer.disable' : 'customer.enable',
    resource: 'customer',
    resourceId: uid,
  }).catch((error) => logger.error('Failed to write audit log', { uid, error: String(error) }));

  return NextResponse.json({ uid, disabled }, { status: 200 });
}
