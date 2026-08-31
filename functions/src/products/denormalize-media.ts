import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface MediaForDenormalization {
  variantId: string | null;
  type: 'image' | 'video';
  url: string;
  sortOrder: number;
}

export interface ProductImageFields {
  primaryImageUrl: string;
  hoverImageUrl: string | null;
}

export function calculateCardImages(media: MediaForDenormalization[]): ProductImageFields {
  const cardImages = media
    .filter((m) => m.variantId === null && m.type === 'image')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    primaryImageUrl: cardImages[0]?.url ?? '',
    hoverImageUrl: cardImages[1]?.url ?? null,
  };
}

/**
 * Thin Cloud Function glue: on any write to a product's media subcollection,
 * re-reads all sibling media and writes the recalculated card-image fields
 * onto the parent product doc. Same split as onVariantWritten in
 * denormalize.ts — a pure, fully-tested function plus a few lines of
 * Admin SDK read/write, exercised live via the Firestore emulator during
 * manual verification of the PDP gallery.
 */
export const onMediaWritten = onDocumentWritten(
  'products/{productId}/media/{mediaId}',
  async (event) => {
    const { productId } = event.params;
    const db = getFirestore();

    const mediaSnapshot = await db.collection('products').doc(productId).collection('media').get();
    const media = mediaSnapshot.docs.map((doc) => doc.data() as MediaForDenormalization);

    const fields = calculateCardImages(media);
    await db.collection('products').doc(productId).set(fields, { merge: true });
  }
);
