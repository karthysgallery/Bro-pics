import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';

const SEARCH_LIMIT = 20;

/**
 * [ABE-26] Directory search by name, phone, or email — three different
 * query shapes dispatched off what `q` looks like, since Firestore has no
 * native "search any of these fields" query. An `@` means email (exact
 * equality); all-digits/leading-`+` means phone (exact equality, matching
 * how phone is already stored — see `apps/web/app/api/admin/users/
 * lookup/route.ts`'s own Firebase-Auth-side exact-phone lookup, a
 * DIFFERENT route for a different purpose — Auth uid lookup, not this
 * Firestore customer directory); anything else is a `displayName` PREFIX
 * range query (`>= q` and `<= q + ''`), the standard Firestore
 * prefix-search trick — a single-field range query, no composite index
 * needed (equality-vs-range only requires one when combined with ANOTHER
 * filter or an orderBy on a different field, neither happens here).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'customers:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Customer read access required');
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) {
    return adminApiError(400, 'invalid_request', 'Missing q');
  }

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('users');
  if (q.includes('@')) {
    query = query.where('email', '==', q);
  } else if (/^\+?\d{6,}$/.test(q)) {
    query = query.where('phone', '==', q);
  } else {
    query = query.where('displayName', '>=', q).where('displayName', '<=', `${q}`);
  }

  const snapshot = await query.limit(SEARCH_LIMIT).get();
  const customers = snapshot.docs.map((doc) => doc.data());

  return NextResponse.json({ customers }, { status: 200 });
}
