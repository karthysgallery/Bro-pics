import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import type { HomepageSection, Product, ProductMedia, Review } from '@bro-pics/shared';

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export async function getActiveHomepageSections(): Promise<HomepageSection[]> {
  const db = getFirestore(getAdminApp());
  const now = new Date();
  const snapshot = await db
    .collection('homepageSections')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as HomepageSection;
      return {
        ...data,
        startsAt: toDateOrNull(data.startsAt),
        endsAt: toDateOrNull(data.endsAt),
      };
    })
    .filter((section) => {
      if (section.startsAt && section.startsAt > now) return false;
      if (section.endsAt && section.endsAt < now) return false;
      return true;
    })
    .map(serializeDoc);
}

export async function getBestSellingProducts(limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .orderBy('ratingCount', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => serializeDoc(doc.data() as Product));
}

export async function getFeaturedProducts(categoryId: string, limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .where('categoryId', '==', categoryId)
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => serializeDoc(doc.data() as Product));
}

export interface HomepageVideo extends ProductMedia {
  productSlug: string;
}

// "Products in motion" has no dedicated video collection of its own — it
// reuses the existing per-product product_media subcollection (the same
// data VideoRail already renders on the PDP), aggregated across a handful
// of best-selling products rather than added as new schema.
export async function getHomepageVideos(limit: number): Promise<HomepageVideo[]> {
  const db = getFirestore(getAdminApp());
  const productsSnapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .orderBy('ratingCount', 'desc')
    .limit(8)
    .get();

  const mediaByProduct = await Promise.all(
    productsSnapshot.docs.map(async (productDoc) => {
      const product = productDoc.data() as Product;
      // Filtered client-side rather than a `where('type', '==', 'video')`
      // query — same approach VideoRail.tsx already uses on the PDP — so
      // this doesn't need a new composite index (type + sortOrder) that
      // doesn't exist today.
      const mediaSnapshot = await db
        .collection('products')
        .doc(productDoc.id)
        .collection('media')
        .orderBy('sortOrder', 'asc')
        .get();
      return mediaSnapshot.docs
        .map((doc) => serializeDoc(doc.data() as ProductMedia))
        .filter((media) => media.type === 'video')
        .map((media) => ({ ...media, productSlug: product.slug }));
    })
  );

  return mediaByProduct.flat().slice(0, limit);
}

export interface HomepageReview extends Review {
  productSlug: string;
}

// Cross-product homepage rail — existing `reviews` collection, no new field.
// Reviews carrying a customer photo are preferred (matches the "photo
// reviews" visual pattern), but this falls back to plain approved reviews
// when none have photos yet, so the section is never empty on a fresh seed.
export async function getFeaturedReviews(limit: number): Promise<HomepageReview[]> {
  const db = getFirestore(getAdminApp());
  // Sorted client-side rather than `.orderBy('createdAt', 'desc')` — that
  // combined with the `where('status', ...)` filter needs a composite
  // index that doesn't exist for this collection. A single equality filter
  // needs no composite index, so this fetches the full approved set (small
  // for this app's scale) and sorts/limits in memory instead.
  const snapshot = await db.collection('reviews').where('status', '==', 'approved').get();

  const approved = snapshot.docs
    .map((doc) => serializeDoc(doc.data() as Review))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const withPhotos = approved.filter((review) => review.media.length > 0);
  const selected = (withPhotos.length > 0 ? withPhotos : approved).slice(0, limit);

  const productIds = [...new Set(selected.map((r) => r.productId))];
  const productDocs = await Promise.all(productIds.map((id) => db.collection('products').doc(id).get()));
  const slugById = new Map(
    productDocs.filter((doc) => doc.exists).map((doc) => [doc.id, (doc.data() as Product).slug])
  );

  return selected.map((review) => ({ ...review, productSlug: slugById.get(review.productId) ?? '' }));
}
