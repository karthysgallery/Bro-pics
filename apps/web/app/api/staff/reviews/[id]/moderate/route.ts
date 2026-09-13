import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../../lib/rate-limit';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const body = await request.json();
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const { id } = await context.params;
  const db = getFirestore(getAdminApp());
  const reviewRef = db.collection('reviews').doc(id);
  const reviewDoc = await reviewRef.get();
  if (!reviewDoc.exists) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }
  const current = reviewDoc.data() as { status: string };
  if (current.status !== 'pending') {
    return NextResponse.json({ error: 'Review is not pending' }, { status: 409 });
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  await reviewRef.update({ status: nextStatus });

  return NextResponse.json({ id, status: nextStatus }, { status: 200 });
}
