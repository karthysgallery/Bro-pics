import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { Product, Variant, ProductMedia, Review, Category } from '@bro-pics/shared';

export interface ProductDetail {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
  reviews: Review[];
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

// Re-exported for backwards compatibility — the pure implementation lives in
// ./gallery-media.ts (no Admin SDK / `server-only` imports) so client
// components can import it directly without pulling firebase-admin into the
// client bundle. Prefer importing from ./gallery-media in new code.
export { selectGalleryMedia } from './gallery-media';

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const db = getFirestore(getAdminApp());

  const productSnapshot = await db
    .collection('products')
    .where('slug', '==', slug)
    .where('isActive', '==', true)
    .limit(1)
    .get();
  if (productSnapshot.empty) return null;

  const productDoc = productSnapshot.docs[0];
  const rawProduct = productDoc.data();
  const product = {
    ...(rawProduct as Product),
    createdAt: toDate(rawProduct.createdAt),
    updatedAt: toDate(rawProduct.updatedAt),
  };
  const productId = productDoc.id;

  const [variantsSnapshot, mediaSnapshot, reviewsSnapshot] = await Promise.all([
    db.collection('products').doc(productId).collection('variants').where('isActive', '==', true).get(),
    db.collection('products').doc(productId).collection('media').orderBy('sortOrder', 'asc').get(),
    db
      .collection('reviews')
      .where('productId', '==', productId)
      .where('status', '==', 'approved')
      .orderBy('createdAt', 'desc')
      .get(),
  ]);

  const variants = variantsSnapshot.docs.map((doc) => doc.data() as Variant);
  const media = mediaSnapshot.docs.map((doc) => doc.data() as ProductMedia);
  const reviews = reviewsSnapshot.docs.map((doc) => {
    const raw = doc.data();
    return { ...(raw as Review), createdAt: toDate(raw.createdAt) };
  });

  return { product, variants, media, reviews };
}

export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  limit: number
): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .where('categoryId', '==', categoryId)
    .limit(limit + 1)
    .get();
  return snapshot.docs
    .map((doc) => doc.data() as Product)
    .filter((p) => p.id !== excludeProductId)
    .slice(0, limit);
}

export async function getAllActiveProductSlugs(): Promise<string[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('products').where('isActive', '==', true).get();
  return snapshot.docs.map((doc) => (doc.data() as Product).slug);
}

export async function getCategoryById(categoryId: string): Promise<Category | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('categories').doc(categoryId).get();
  if (!doc.exists) return null;
  return doc.data() as Category;
}
