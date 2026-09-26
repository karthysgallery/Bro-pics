import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildPublicMediaUrl } from './media-public-url';

describe('buildPublicMediaUrl', () => {
  const originalBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'bropics-app.appspot.com';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = originalBucket;
  });

  it('builds a Firebase public download URL with the path URL-encoded', () => {
    const url = buildPublicMediaUrl('public/media/abc-123.jpg');
    expect(url).toBe(
      'https://firebasestorage.googleapis.com/v0/b/bropics-app.appspot.com/o/public%2Fmedia%2Fabc-123.jpg?alt=media'
    );
  });

  it('throws when the bucket env var is not set', () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    expect(() => buildPublicMediaUrl('public/media/x.jpg')).toThrow();
  });
});
