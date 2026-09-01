import type { Firestore } from 'firebase-admin/firestore';
import type { Variant } from '@bro-pics/shared';

/**
 * Looks up a Variant by its id via a collection-group query on `variants`
 * (variants are stored as a subcollection of `products/{productId}`, so
 * finding one by a bare variantId — with no known parent product — requires
 * querying across every product's variants subcollection). Requires the
 * COLLECTION_GROUP-scoped single-field index on `variants.id` registered in
 * firestore.indexes.json's `fieldOverrides` (mirrors the existing
 * `frameTemplates.variantId` collection-group index).
 *
 * Used server-side wherever a route receives a bare variantId and must not
 * trust client-supplied variant data (minUploadPx, widthIn/heightIn, etc.)
 * — see Findings 6 and 7 in the final review.
 */
export async function findVariantById(db: Firestore, variantId: string): Promise<Variant | null> {
  const snapshot = await db.collectionGroup('variants').where('id', '==', variantId).limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as Variant;
}
