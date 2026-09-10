import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { ReviewStatusSchema } from '@bro-pics/shared';

interface ReviewRow {
  id: string;
  productId: string;
  userId: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  status: string;
  createdAt: unknown;
}

interface RawReviewData {
  productId: string;
  userId: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  status: string;
  createdAt: unknown;
}

export async function GET(request: Request): Promise<NextResponse> {
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

  const url = new URL(request.url);
  const parsed = ReviewStatusSchema.safeParse(url.searchParams.get('status'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('status', '==', parsed.data).get();
  const rows: ReviewRow[] = snapshot.docs.map((doc) => {
    const data = doc.data() as RawReviewData;
    return {
      id: doc.id,
      productId: data.productId,
      userId: data.userId,
      orderId: data.orderId,
      rating: data.rating,
      title: data.title,
      body: data.body,
      isVerified: data.isVerified,
      status: data.status,
      createdAt: data.createdAt,
    };
  });

  const distinctProductIds = [...new Set(rows.map((r) => r.productId))];
  const productEntries = await Promise.all(
    distinctProductIds.map(async (productId) => {
      const productDoc = await db.collection('products').doc(productId).get();
      return [productId, productDoc.exists ? (productDoc.data() as { title: string }).title : 'Unknown product'] as const;
    })
  );
  const titleByProductId = new Map(productEntries);

  const reviews = rows.map((r) => ({ ...r, productTitle: titleByProductId.get(r.productId) }));

  return NextResponse.json({ reviews }, { status: 200 });
}
