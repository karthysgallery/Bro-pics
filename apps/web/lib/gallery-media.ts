import type { ProductMedia } from '@bro-pics/shared';

/**
 * Gallery fallback rule (PDP design spec §2.3): show media belonging to the
 * selected variant if any exists; otherwise show variant-agnostic media,
 * sorted by sortOrder.
 *
 * Kept in its own module (no Admin SDK / `server-only` imports) so client
 * components like ProductDetailClient can import it directly without pulling
 * `firebase-admin` into the client bundle — `server-only` throws a hard
 * webpack build error on any import chain into client code, so tree-shaking
 * alone does not save us if this lived in firestore-product-detail.ts.
 */
export function selectGalleryMedia(media: ProductMedia[], selectedVariantId: string | null): ProductMedia[] {
  if (selectedVariantId !== null) {
    const variantMedia = media.filter((m) => m.variantId === selectedVariantId);
    if (variantMedia.length > 0) {
      return [...variantMedia].sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }
  return media.filter((m) => m.variantId === null).sort((a, b) => a.sortOrder - b.sortOrder);
}
