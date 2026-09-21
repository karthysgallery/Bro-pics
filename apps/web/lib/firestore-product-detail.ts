import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import type { Product, Variant, ProductMedia, Review, Category, FrameTemplate } from '@bro-pics/shared';

export interface ProductDetail {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
  reviews: Review[];
}


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
  const product = serializeDoc(productDoc.data() as Product);
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

  const variants = variantsSnapshot.docs.map((doc) => serializeDoc(doc.data() as Variant));
  const media = mediaSnapshot.docs.map((doc) => serializeDoc(doc.data() as ProductMedia));
  const reviews = reviewsSnapshot.docs.map((doc) => serializeDoc(doc.data() as Review));

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
    .map((doc) => serializeDoc(doc.data() as Product))
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
  return serializeDoc(doc.data() as Category);
}

/**
 * All variants' current FrameTemplate, in one shot — the product page
 * already knows its own productId server-side, so this is a single query
 * against `products/{productId}/frameTemplates` rather than the N
 * collection-group queries (one per variant) the client used to make on
 * mount. That client-side fetch was the cause of the product page briefly
 * rendering the plain Gallery before swapping to the personalization editor
 * once its `useEffect` resolved — fetching here and passing the result down
 * as an initial prop means the editor is present on the very first paint.
 * Keyed by variantId, resolving to whichever doc is `isCurrent` (or the
 * highest `version` if none is marked current) — same precedence as
 * /api/frame-templates/[variantId].
 */
export async function getFrameTemplatesByProductId(productId: string): Promise<Record<string, FrameTemplate>> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('products').doc(productId).collection('frameTemplates').get();
  const templates = snapshot.docs
    .map((doc) => doc.data() as FrameTemplate)
    .filter((t) => Array.isArray(t.printableRects) && t.printableRects.length > 0);

  const byVariant = new Map<string, FrameTemplate>();
  for (const template of templates) {
    const existing = byVariant.get(template.variantId);
    if (!existing) {
      byVariant.set(template.variantId, template);
      continue;
    }
    const templateWins = template.isCurrent !== existing.isCurrent ? template.isCurrent : template.version > existing.version;
    if (templateWins) byVariant.set(template.variantId, template);
  }

  return Object.fromEntries(Array.from(byVariant.entries()).map(([variantId, template]) => [variantId, serializeDoc(template)]));
}
