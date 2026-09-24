import 'server-only';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './firebase-admin';
import { isValidRole, roleHasPermission, type PermissionKey, type Role } from '@bro-pics/shared';

export interface PermissionContext {
  uid: string;
  role: Role;
}

/**
 * [ABE-01] Verifies the bearer token and extracts {uid, role} — returns
 * null if the token is missing/invalid, or the role claim isn't one of
 * the five known roles (packages/shared/src/auth/permissions.ts). Does
 * NOT check any specific permission on its own; see requirePermission
 * below for the check most routes actually want.
 */
export async function getPermissionContext(request: Request): Promise<PermissionContext | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken, true);
    const role = (decoded as { role?: unknown }).role;
    if (!isValidRole(role)) return null;
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}

/**
 * The one function most admin/staff routes actually call: verifies the
 * token AND the specific permission key in one step. Returns the caller's
 * uid on success, or null — the caller responds 403, same "null always
 * means 403 here, never 'proceed as signed out'" contract
 * getStaffUserIdFromAuthHeader/getAdminUserIdFromAuthHeader already use.
 *
 * [ABE-02] Not yet applied to any existing route — this pass built the
 * plumbing (ABE-01); wiring it into every /api/admin/* and /api/staff/*
 * route, replacing the current binary admin/staff checks, is ABE-02's own
 * task, done as its own sweep with a route-enumeration test, not folded
 * into this one.
 */
export async function requirePermission(request: Request, key: PermissionKey): Promise<string | null> {
  const ctx = await getPermissionContext(request);
  if (!ctx) return null;
  return roleHasPermission(ctx.role, key) ? ctx.uid : null;
}
