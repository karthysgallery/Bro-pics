import 'server-only';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './firebase-admin';

/**
 * Optional identity extraction — a null return means "proceed as signed
 * out," never an error response on its own. Callers that REQUIRE a signed-in
 * user (checkout) turn a null into their own 401; callers where auth is
 * optional (uploads/customizations, pre-login-compatible) just omit userId.
 */
export async function getUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Like getUserIdFromAuthHeader, but ALSO requires the decoded token's role
 * claim to be 'admin', 'staff', or 'super_admin' — mirroring
 * firestore.rules' isStaffOrAdmin() exactly (a `super_admin` is a
 * superset of `admin` — see permissions.ts's ROLE_PERMISSIONS, where
 * super_admin holds every permission admin does plus team:manage; it
 * must never be locked out of anything a plain admin can already reach).
 * Unlike getUserIdFromAuthHeader, a null return here is never "proceed as
 * signed out" — it always means the caller must respond 403.
 *
 * [ABE-01] Pre-dates the 5-role permission model in
 * packages/shared/src/auth/permissions.ts — kept as a lightweight,
 * unchanged-behavior check for the many existing routes still using it.
 * requirePermission (./require-permission.ts) is the new, permission-key-
 * scoped alternative; ABE-02 migrates existing routes to it.
 */
export async function getStaffUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken, true);
    const role = (decoded as { role?: string }).role;
    if (role !== 'admin' && role !== 'staff' && role !== 'super_admin') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}
