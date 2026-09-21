import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { checkRateLimit } from '../../../lib/rate-limit';

// Stored as users/{uid}/wishlist/{productId} — a subcollection of one
// empty doc per product id, not an array field, so add/remove are single
// idempotent doc writes rather than a read-modify-write race on one array.
// Unmatched by firestore.rules (deny-by-default), so this is reachable only
// through this admin-backed route, never a direct client read.
async function getWishlistIds(userId: string): Promise<string[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('users').doc(userId).collection('wishlist').get();
  return snapshot.docs.map((d) => d.id);
}

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

  const productIds = await getWishlistIds(userId);
  return NextResponse.json({ productIds }, { status: 200 });
}

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
  const productId = typeof body?.productId === 'string' ? body.productId : null;
  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  await db.collection('users').doc(userId).collection('wishlist').doc(productId).set({ addedAt: new Date().toISOString() });

  const productIds = await getWishlistIds(userId);
  return NextResponse.json({ productIds }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
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

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  await db.collection('users').doc(userId).collection('wishlist').doc(productId).delete();

  const productIds = await getWishlistIds(userId);
  return NextResponse.json({ productIds }, { status: 200 });
}
