import { describe, it, expect } from 'vitest';
import { UploadSchema } from './upload';

describe('UploadSchema', () => {
  it('accepts an upload with no userId (pre-login)', () => {
    const result = UploadSchema.safeParse({
      id: 'up_1', sessionId: 'sess_1', originalUrl: 'https://x/y.jpg',
      widthPx: 4000, heightPx: 3000, mime: 'image/jpeg', bytes: 123456,
      exifStripped: true, status: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an upload with userId set (post-reconciliation)', () => {
    const result = UploadSchema.safeParse({
      id: 'up_1', sessionId: 'sess_1', userId: 'user_1', originalUrl: 'https://x/y.jpg',
      widthPx: 4000, heightPx: 3000, mime: 'image/jpeg', bytes: 123456,
      exifStripped: true, status: 'ready',
    });
    expect(result.success).toBe(true);
  });
});
