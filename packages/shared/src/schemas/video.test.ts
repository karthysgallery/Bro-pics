import { describe, it, expect } from 'vitest';
import { VideoSchema } from './video';

const validVideo = {
  id: 'video_1',
  mediaId: 'media_1',
  thumbnailMediaId: null,
  caption: 'Unboxing the wooden frame',
  productId: null,
  placement: 'homepage' as const,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-09-01'),
};

describe('VideoSchema', () => {
  it('accepts a valid video with no thumbnail or product association', () => {
    expect(VideoSchema.parse(validVideo)).toEqual(validVideo);
  });

  it('accepts a video with a thumbnail and product association', () => {
    const withAssociations = { ...validVideo, thumbnailMediaId: 'media_2', productId: 'prod_1' };
    expect(VideoSchema.parse(withAssociations)).toEqual(withAssociations);
  });

  it('rejects an unknown placement', () => {
    expect(() => VideoSchema.parse({ ...validVideo, placement: 'sidebar' })).toThrow();
  });

  it('accepts every documented placement', () => {
    for (const placement of ['homepage', 'product_page', 'standalone']) {
      expect(() => VideoSchema.parse({ ...validVideo, placement })).not.toThrow();
    }
  });
});
