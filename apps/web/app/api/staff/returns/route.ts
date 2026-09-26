import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { ReturnStatusSchema } from '@bro-pics/shared';

// A top-level `returns` collection (not a subcollection of orders) so this
// queue query is a plain single-field equality filter, auto-indexed by
// Firestore — a subcollection would need a collectionGroup query, and this
// app already avoids adding new collectionGroup indexes it can't deploy
// from this environment (same constraint documented on the recommendations
// helpers' frequently-bought-together gap).
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'returns:read');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Staff access required' }, { status: permission.status });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const db = getFirestore(getAdminApp());

  if (statusParam) {
    const parsed = ReturnStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const snapshot = await db.collection('returns').where('status', '==', parsed.data).get();
    return NextResponse.json({ returns: snapshot.docs.map((d) => d.data()) }, { status: 200 });
  }

  const snapshot = await db.collection('returns').get();
  return NextResponse.json({ returns: snapshot.docs.map((d) => d.data()) }, { status: 200 });
}
