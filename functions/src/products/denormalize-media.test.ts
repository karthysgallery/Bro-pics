import { describe, it, expect } from 'vitest';
import { calculateCardImages } from './denormalize-media';

describe('calculateCardImages', () => {
  it('returns empty primary and null hover when there is no media', () => {
    expect(calculateCardImages([])).toEqual({ primaryImageUrl: '', hoverImageUrl: null });
  });

  it('picks the two lowest-sortOrder variant-agnostic images as primary/hover', () => {
    const media = [
      { variantId: null, type: 'image' as const, url: '/a.svg', sortOrder: 1 },
      { variantId: null, type: 'image' as const, url: '/b.svg', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/c.svg', sortOrder: 2 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/b.svg', hoverImageUrl: '/a.svg' });
  });

  it('returns a null hoverImageUrl when only one variant-agnostic image exists', () => {
    const media = [{ variantId: null, type: 'image' as const, url: '/only.svg', sortOrder: 0 }];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/only.svg', hoverImageUrl: null });
  });

  it('ignores variant-specific media when choosing card images', () => {
    const media = [
      { variantId: 'var_1', type: 'image' as const, url: '/variant-only.svg', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/generic.svg', sortOrder: 1 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/generic.svg', hoverImageUrl: null });
  });

  it('ignores video media when choosing card images', () => {
    const media = [
      { variantId: null, type: 'video' as const, url: '/clip.mp4', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/still.svg', sortOrder: 1 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/still.svg', hoverImageUrl: null });
  });
});
