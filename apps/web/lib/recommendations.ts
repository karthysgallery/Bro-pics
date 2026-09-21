import { getFirestore, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import type { Product } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';

// Client-callable recommendation helpers — used from client pages (the
// account dashboard, Phase 2) rather than lib/firestore-product-detail.ts's
// getRelatedProducts, which is server-only (firebase-admin, called from a
// Server Component). All three below query only the `products` collection,
// which firestore.rules makes world-readable, so no admin route is needed.
//
// Sorting happens in memory rather than via Firestore `orderBy` on purpose:
// the existing composite indexes (firestore.indexes.json) only cover
// isActive+categoryId+{createdAt|ratingCount|minPrice/maxPrice} — there's
// no index for isActive alone + createdAt/ratingCount, and this environment
// can't deploy a new one (same limitation documented for the account-phase
// reviews/mine route). This catalogue is small enough that an in-memory
// sort over all active products is cheap.
//
// Two spec items are NOT built here, deliberately:
// - Frequently-bought-together would need a Firestore collectionGroup
//   query over every order's `items` subcollection (or a denormalized
//   productIds[] array on Order) — no collectionGroup index exists for
//   `items` today, and querying without one fails outright in production.
//   A real fix needs either that new index or the denormalized field.
// - Personalized offers need a coupon-targeting rules engine that doesn't
//   exist — nothing to build this on top of honestly.
// Both are documented as backend gaps rather than faked.

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

export async function getNewArrivals(excludeProductId: string | null, count = 8): Promise<Product[]> {
  const db = getFirestore(getFirebaseApp());
  const snapshot = await getDocs(query(collection(db, 'products'), where('isActive', '==', true)));
  return snapshot.docs
    .map((d) => d.data() as Product)
    .filter((p) => p.id !== excludeProductId)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, count);
}

// No salesCount/viewCount field exists on Product — ratingCount (already
// denormalized) is the closest available engagement proxy, tie-broken by
// recency. A real sales-velocity signal needs a new counter field;
// documented as a backend gap, not implemented here.
export async function getTrendingProducts(excludeProductId: string | null, count = 8): Promise<Product[]> {
  const db = getFirestore(getFirebaseApp());
  const snapshot = await getDocs(query(collection(db, 'products'), where('isActive', '==', true)));
  return snapshot.docs
    .map((d) => d.data() as Product)
    .filter((p) => p.id !== excludeProductId)
    .sort((a, b) => b.ratingCount - a.ratingCount || toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, count);
}

export async function getWishlistBasedRecommendations(wishlistProductIds: string[], count = 8): Promise<Product[]> {
  if (wishlistProductIds.length === 0) return [];
  const db = getFirestore(getFirebaseApp());

  const wishlistedDocs = await Promise.all(wishlistProductIds.map((id) => getDoc(doc(db, 'products', id))));
  const categoryIds = [...new Set(wishlistedDocs.filter((s) => s.exists()).map((s) => (s.data() as Product).categoryId))];
  if (categoryIds.length === 0) return [];

  // One query per category (each an isActive+categoryId equality pair,
  // matching the existing composite index's prefix) rather than a single
  // `categoryId IN [...]` query, so this never depends on exactly how
  // Firestore resolves an `in` filter against that index.
  const perCategory = await Promise.all(
    categoryIds.map((categoryId) =>
      getDocs(query(collection(db, 'products'), where('isActive', '==', true), where('categoryId', '==', categoryId)))
    )
  );

  const seen = new Set(wishlistProductIds);
  const results: Product[] = [];
  for (const snapshot of perCategory) {
    for (const docSnap of snapshot.docs) {
      const product = docSnap.data() as Product;
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      results.push(product);
      if (results.length >= count) return results;
    }
  }
  return results;
}
