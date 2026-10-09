import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { PermissionKey } from '@bro-pics/shared';
import { getAdminApp } from '../firebase-admin';
import { requirePermission } from '../require-permission';
import { checkRateLimit } from '../rate-limit';
import { adminApiError } from '../admin-api-error';

/** Rate limit + permission for the catalogue setup routes; returns the db and the staff uid, or the error response. */
export async function catalogueGuard(request: Request, key: PermissionKey): Promise<{ ok: true; uid: string; db: Firestore } | { ok: false; response: NextResponse }> {
  const rate = checkRateLimit(request, 'staff');
  if (!rate.allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }) };
  }
  const permission = await requirePermission(request, key);
  if (!permission.ok) {
    return { ok: false, response: adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', key.startsWith('catalogue:read') ? 'Catalogue read access required' : 'Catalogue write access required') };
  }
  return { ok: true, uid: permission.uid, db: getFirestore(getAdminApp()) };
}
