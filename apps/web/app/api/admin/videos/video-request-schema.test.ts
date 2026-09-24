import { describe, it, expect } from 'vitest';
import { CreateVideoBodySchema, UpdateVideoBodySchema, ReorderVideosBodySchema } from './video-request-schema';

describe('CreateVideoBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreateVideoBodySchema.parse({ mediaId: 'media_1', placement: 'homepage' });
    expect(result).toMatchObject({ mediaId: 'media_1', thumbnailMediaId: null, caption: '', productId: null, isActive: true, sortOrder: 0 });
  });

  it('rejects an unknown field', () => {
    expect(CreateVideoBodySchema.safeParse({ mediaId: 'media_1', placement: 'homepage', notAField: 1 }).success).toBe(false);
  });

  it('rejects an unknown placement', () => {
    expect(CreateVideoBodySchema.safeParse({ mediaId: 'media_1', placement: 'sidebar' }).success).toBe(false);
  });

  it('requires placement', () => {
    expect(CreateVideoBodySchema.safeParse({ mediaId: 'media_1' }).success).toBe(false);
  });
});

describe('UpdateVideoBodySchema', () => {
  it('accepts a partial body', () => {
    expect(UpdateVideoBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('rejects an unknown field via strict()', () => {
    expect(UpdateVideoBodySchema.safeParse({ notAField: 1 }).success).toBe(false);
  });
});

describe('ReorderVideosBodySchema', () => {
  it('rejects an empty array', () => {
    expect(ReorderVideosBodySchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});
