import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
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
  featured?: boolean;
  placement?: string | null;
  moderationNote?: string | null;
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
  featured?: boolean;
  placement?: string | null;
  moderationNote?: string | null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'reviews:moderate');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Staff access required' }, { status: permission.status });
  }

  const url = new URL(request.url);
  const parsed = ReviewStatusSchema.safeParse(url.searchParams.get('status'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  // [ABE-22] "search and filters" — productId/rating/isVerified/featured
  // are each a plain equality filter, chained onto the required `status`
  // equality filter. A pure multi-equality `.where()` chain needs no
  // composite index (unlike equality+orderBy or equality+range), so this
  // adds filtering without touching firestore.indexes.json. `q` is a
  // client-side substring match over title/body, same reasoning as every
  // other admin list route in this codebase that has no real full-text
  // search need yet (ABE-10's media library, ABE-15's order search).
  const productId = url.searchParams.get('productId');
  const ratingParam = url.searchParams.get('rating');
  const isVerifiedParam = url.searchParams.get('isVerified');
  const featuredParam = url.searchParams.get('featured');
  const q = url.searchParams.get('q');

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('reviews').where('status', '==', parsed.data);
  if (productId) {
    query = query.where('productId', '==', productId);
  }
  if (ratingParam) {
    const rating = Number(ratingParam);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    }
    query = query.where('rating', '==', rating);
  }
  if (isVerifiedParam === 'true' || isVerifiedParam === 'false') {
    query = query.where('isVerified', '==', isVerifiedParam === 'true');
  }
  if (featuredParam === 'true' || featuredParam === 'false') {
    query = query.where('featured', '==', featuredParam === 'true');
  }

  const snapshot = await query.get();
  let rows: ReviewRow[] = snapshot.docs.map((doc) => {
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
      featured: data.featured,
      placement: data.placement,
      moderationNote: data.moderationNote,
    };
  });

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle) || r.body.toLowerCase().includes(needle));
  }

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
