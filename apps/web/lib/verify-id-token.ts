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
