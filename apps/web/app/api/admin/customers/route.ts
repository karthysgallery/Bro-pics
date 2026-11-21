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
  const q = url.searchParams.get('q')?.trim() ?? '';
  const db = getFirestore(getAdminApp());
  const users = db.collection('users');
  const pick = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      displayName: d.displayName ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      role: d.role ?? null,
      createdAt: d.createdAt ?? null,
      orderCount: d.orderCount ?? 0,
      totalSpent: d.totalSpent ?? 0,
      lastOrderAt: d.lastOrderAt ?? null,
      disabled: d.disabled === true,
    };
  };

  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (!q) {
    // No search: the newest customer accounts first (staff accounts are found by searching, not listed).
    docs = (await users.orderBy('createdAt', 'desc').limit(SEARCH_LIMIT * 3).get()).docs
      .filter((d) => { const role = (d.data() as { role?: unknown }).role; return !role || role === 'customer'; })
      .slice(0, SEARCH_LIMIT * 2);
  } else if (q.includes('@')) {
    docs = (await users.where('email', '==', q.toLowerCase()).limit(SEARCH_LIMIT).get()).docs;
    if (docs.length === 0 && q !== q.toLowerCase()) docs = (await users.where('email', '==', q).limit(SEARCH_LIMIT).get()).docs;
  } else if (/^[+\d\s-]{6,}$/.test(q)) {
    // Phones are stored as +91XXXXXXXXXX; accept 10 digits, 91XXXXXXXXXX, spaces and dashes.
    const digits = q.replace(/\D/g, '');
    const phone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
    docs = (await users.where('phone', '==', phone).limit(SEARCH_LIMIT).get()).docs;
  } else {
    // Name: a prefix search on the name as typed, and with a capital first letter (names are saved as entered).
    const variants = [...new Set([q, q.charAt(0).toUpperCase() + q.slice(1)])];
    const snaps = await Promise.all(variants.map((v) => users.where('displayName', '>=', v).where('displayName', '<=', `${v}\uf8ff`).limit(SEARCH_LIMIT).get()));
    const seen = new Set<string>();
    docs = snaps.flatMap((sn) => sn.docs).filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  }
  const customers = docs.map(pick);

  return NextResponse.json({ customers }, { status: 200 });
}
