import { describe, it, expect } from 'vitest';
import { selectGalleryMedia } from './firestore-product-detail';
import type { ProductMedia } from '@bro-pics/shared';

const genericImage: ProductMedia = {
  id: 'm1', productId: 'p1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0,
};
const variantImage: ProductMedia = {
  id: 'm2', productId: 'p1', variantId: 'v1', type: 'image', url: '/variant.svg', alt: '', sortOrder: 0,
};

describe('selectGalleryMedia', () => {
  it('returns variant-specific media when the selected variant has any', () => {
    const result = selectGalleryMedia([genericImage, variantImage], 'v1');
    expect(result).toEqual([variantImage]);
  });

  it('falls back to variant-agnostic media when the selected variant has none', () => {
    const result = selectGalleryMedia([genericImage, variantImage], 'v2-with-no-media');
    expect(result).toEqual([genericImage]);
  });

  it('returns all variant-agnostic media, sorted by sortOrder, when no variant is selected', () => {
    const second: ProductMedia = { ...genericImage, id: 'm3', url: '/second.svg', sortOrder: 1 };
    const result = selectGalleryMedia([second, genericImage], null);
    expect(result).toEqual([genericImage, second]);
  });
});
