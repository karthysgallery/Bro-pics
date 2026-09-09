import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { findVerifiedPurchase } from '../../../lib/order-lookup';
import { ReviewSchema } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const productId = typeof body?.productId === 'string' ? body.productId : null;
  const rating = typeof body?.rating === 'number' ? body.rating : null;
  const title = typeof body?.title === 'string' ? body.title : null;
  const reviewBody = typeof body?.body === 'string' ? body.body : null;

  if (!productId || rating === null || !title || !reviewBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  const existingSnapshot = await db
    .collection('reviews')
    .where('userId', '==', userId)
    .where('productId', '==', productId)
    .limit(1)
    .get();
  if (!existingSnapshot.empty) {
    return NextResponse.json({ error: 'You have already reviewed this product' }, { status: 409 });
  }

  const verifiedPurchase = await findVerifiedPurchase(db, userId, productId);

  const reviewRef = db.collection('reviews').doc();
  const review = ReviewSchema.parse({
    id: reviewRef.id,
    productId,
    userId,
    orderId: verifiedPurchase?.orderId,
    rating,
    title,
    body: reviewBody,
    media: [],
    isVerified: verifiedPurchase !== null,
    status: 'pending',
    createdAt: new Date(),
  });

  await reviewRef.set(review);

  return NextResponse.json({ id: reviewRef.id, status: 'pending' }, { status: 200 });
}
