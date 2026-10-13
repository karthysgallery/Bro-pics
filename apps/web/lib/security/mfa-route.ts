import 'server-only';
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { isValidRole, logger } from '@bro-pics/shared';
import { getAdminApp } from '../firebase-admin';
import { checkRateLimit } from '../rate-limit';
import { adminApiError } from '../admin-api-error';
import { writeAuditLog } from '../audit-log';
import { attachSessionCookie } from '../services/session';
import { MfaError, hasMfaProof } from './admin-mfa';

/** A signed-in staff/admin account (any role) — the authenticator routes run before the second step is done. */
export async function staffIdentity(request: Request): Promise<
  { ok: true; db: Firestore; uid: string; role: string; phone: string; name?: string; account: string } | { ok: false; response: NextResponse }
> {
  const rate = checkRateLimit(request, 'staff');
  if (!rate.allowed) return { ok: false, response: NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }) };
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return { ok: false, response: adminApiError(401, 'unauthenticated', 'Sign in again to continue.') };
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(header.slice(7), true);
    const role = (decoded as { role?: unknown }).role;
    if (!isValidRole(role)) return { ok: false, response: adminApiError(403, 'forbidden', 'This account has no admin access.') };
    const phone = String(decoded.phone_number ?? '');
    return { ok: true, db: getFirestore(getAdminApp()), uid: decoded.uid, role, phone, name: decoded.name, account: phone || decoded.email || decoded.uid };
  } catch {
    return { ok: false, response: adminApiError(401, 'unauthenticated', 'Sign in again to continue.') };
  }
}

/** A signed-in staff account that has ALSO passed the second step in this browser (needed to change its sign-in methods). */
export async function verifiedStaff(request: Request): ReturnType<typeof staffIdentity> {
  const who = await staffIdentity(request);
  if (!who.ok) return who;
  if (!(await hasMfaProof(who.db, request, who.uid))) return { ok: false, response: adminApiError(401, 'unauthenticated', 'Enter your authenticator code first.') };
  return who;
}

export function mfaErrorResponse(err: unknown): NextResponse {
  if (err instanceof MfaError) return adminApiError(err.status === 423 ? 429 : err.status === 409 ? 409 : 400, err.status === 423 ? 'rate_limited' : err.status === 409 ? 'conflict' : 'invalid_request', err.message);
  logger.error('Authenticator step failed', { error: String(err) });
  return adminApiError(500, 'internal', 'Something went wrong. Try again.');
}

export function withSession(body: unknown, sessionToken: string | null, status = 200): NextResponse {
  const res = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (sessionToken) attachSessionCookie(res, sessionToken);
  return res;
}

export function audit(db: Firestore, uid: string, action: string, details: Record<string, unknown> = {}) {
  return writeAuditLog(db, { actorUid: uid, action, resource: 'staffMfa', resourceId: uid, details }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));
}
