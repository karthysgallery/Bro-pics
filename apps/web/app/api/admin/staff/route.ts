import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';

/**
 * [ABE-27] The Firestore mirror `staff/{uid}` (kept in sync with each
 * account's Auth custom claim by POST /api/admin/users/[uid]/role) is
 * exactly what makes "list every staff member" possible at all — custom
 * claims aren't queryable. `active` is an optional single-equality filter
 * (no composite index needed) so an admin can see only current staff by
 * default, or everyone (including cleared-role history) with
 * `?active=false` or omitting the filter entirely.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'team:manage');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Admin access required' }, { status: permission.status });
  }

  const url = new URL(request.url);
  const activeParam = url.searchParams.get('active');

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('staff');
  if (activeParam === 'true' || activeParam === 'false') {
    query = query.where('active', '==', activeParam === 'true');
  }

  const snapshot = await query.get();
  const staff = snapshot.docs.map((doc) => doc.data());

  return NextResponse.json({ staff }, { status: 200 });
}
