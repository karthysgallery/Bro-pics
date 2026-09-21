import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import type { Review } from '@bro-pics/shared';

// firestore.rules only allows reading a review directly when its status is
// 'approved' (or the caller is staff/admin) — a customer's own pending or
// rejected reviews are invisible to a plain client-side query. This route
// reads via firebase-admin (which bypasses security rules, same as every
// other admin-adjacent route in this app) so "My Reviews" can show a
// customer their own reviews across every status, not just approved ones.
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  // A plain equality filter (no orderBy) needs no composite index — adding
  // one for `userId == / createdAt desc` would require a Firestore console
  // deployment this environment can't perform (see the documented Storage
  // CORS gap for the same class of limitation), so the sort happens here
  // in memory instead. Review counts per customer are small, so this is
  // cheap.
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('userId', '==', userId).get();
  const reviews = snapshot.docs
    .map((d) => d.data() as Review)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  return NextResponse.json({ reviews }, { status: 200 });
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}
