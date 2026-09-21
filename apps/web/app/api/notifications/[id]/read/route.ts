import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('users').doc(userId).collection('notifications').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: `Unknown notification: ${id}` }, { status: 404 });
  }

  await ref.update({ isRead: true });
  return NextResponse.json({ isRead: true }, { status: 200 });
}
