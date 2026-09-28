import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import type { Order, OrderItem, Review, Product } from '@bro-pics/shared';

/**
 * [FE-38] "Pending review" prompts for delivered items — every delivered
 * order's items, minus any product this customer has already reviewed
 * (in ANY status: once reviewed, never prompted again, even if that
 * review was rejected — re-reviewing isn't this feature's job). Same
 * "single equality filter, sort/filter the rest in memory" pattern as
 * `/api/reviews/mine` — a composite `userId + status` index for orders
 * doesn't exist and this environment can't deploy one.
 */
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

  const db = getFirestore(getAdminApp());

  const [ordersSnapshot, reviewsSnapshot] = await Promise.all([
    db.collection('orders').where('userId', '==', userId).get(),
    db.collection('reviews').where('userId', '==', userId).get(),
  ]);

  const deliveredOrders = ordersSnapshot.docs
    .map((d) => d.data() as Order)
    .filter((order) => order.status === 'delivered');

  const reviewedProductIds = new Set(reviewsSnapshot.docs.map((d) => (d.data() as Review).productId));

  const itemsPerOrder = await Promise.all(
    deliveredOrders.map((order) => db.collection('orders').doc(order.id).collection('items').get())
  );

  const seenProductIds = new Set<string>();
  const pendingItems: { productId: string; title: string; orderId: string }[] = [];
  for (let i = 0; i < deliveredOrders.length; i++) {
    const items = itemsPerOrder[i].docs.map((d) => d.data() as OrderItem);
    for (const item of items) {
      if (reviewedProductIds.has(item.productId) || seenProductIds.has(item.productId)) continue;
      seenProductIds.add(item.productId);
      pendingItems.push({ productId: item.productId, title: item.title, orderId: deliveredOrders[i].id });
    }
  }

  // A pending item needs the product's SLUG (not stored on OrderItem) to
  // link to its review form — one lookup per distinct product, same
  // reasoning the order-detail page's own "Personalize again" link
  // already established.
  const productDocs = await Promise.all(
    pendingItems.map((item) => db.collection('products').doc(item.productId).get())
  );
  const pending = pendingItems
    .map((item, i) => {
      const slug = productDocs[i].exists ? (productDocs[i].data() as Product).slug : null;
      return slug ? { ...item, slug } : null;
    })
    .filter((item): item is { productId: string; title: string; orderId: string; slug: string } => item !== null);

  return NextResponse.json({ pending }, { status: 200 });
}
