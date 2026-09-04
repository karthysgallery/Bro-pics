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
 * claim to be 'admin' or 'staff' — mirroring firestore.rules' isStaffOrAdmin()
 * exactly. Unlike getUserIdFromAuthHeader, a null return here is never
 * "proceed as signed out" — it always means the caller must respond 403.
 */
export async function getStaffUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    const role = (decoded as { role?: string }).role;
    if (role !== 'admin' && role !== 'staff') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}
