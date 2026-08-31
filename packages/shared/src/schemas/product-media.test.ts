import { describe, it, expect } from 'vitest';
import { ProductMediaSchema } from './product-media';

const validMedia = {
  id: 'media_1',
  productId: 'prod_classic_wooden_frame',
  variantId: null,
  type: 'image' as const,
  url: '/placeholders/products/classic-wooden-frame-1.svg',
  alt: 'Classic Wooden Photo Frame, front view',
  sortOrder: 0,
};

describe('ProductMediaSchema', () => {
  it('accepts variant-agnostic image media', () => {
    expect(ProductMediaSchema.parse(validMedia)).toEqual(validMedia);
  });

  it('accepts variant-specific media with a variantId', () => {
    const variantSpecific = { ...validMedia, id: 'media_2', variantId: 'var_classic_wooden_frame_8x12_black' };
    expect(ProductMediaSchema.parse(variantSpecific)).toEqual(variantSpecific);
  });

  it('accepts type "video"', () => {
    const video = { ...validMedia, id: 'media_3', type: 'video' as const, url: '/placeholders/videos/product-demo.mp4' };
    expect(ProductMediaSchema.parse(video)).toEqual(video);
  });

  it('rejects an unknown type', () => {
    const invalid = { ...validMedia, type: 'gif' };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative sortOrder', () => {
    const invalid = { ...validMedia, sortOrder: -1 };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty url', () => {
    const invalid = { ...validMedia, url: '' };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });
});
