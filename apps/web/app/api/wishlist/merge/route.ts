import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';

// A one-time union merge on sign-in — unlike the cart's reconcile, this
// needs no price/stock revalidation and no idempotency key: writing the
// same productId doc twice is already a no-op (same doc id, same shape),
// so a retried or duplicate call is safe on its own.
export async function POST(request: Request): Promise<NextResponse> {
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

  const body = await request.json();
  const productIds = Array.isArray(body?.productIds) ? body.productIds.filter((id: unknown) => typeof id === 'string') : [];

  const db = getFirestore(getAdminApp());
  const wishlistRef = db.collection('users').doc(userId).collection('wishlist');

  if (productIds.length > 0) {
    const batch = db.batch();
    for (const productId of productIds) {
      batch.set(wishlistRef.doc(productId), { addedAt: new Date().toISOString() }, { merge: true });
    }
    await batch.commit();
  }

  const snapshot = await wishlistRef.get();
  return NextResponse.json({ productIds: snapshot.docs.map((d) => d.id) }, { status: 200 });
}
