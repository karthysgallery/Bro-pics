import { describe, it, expect } from 'vitest';
import { UploadSchema } from './upload';

function baseUpload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'up_1',
    sessionId: 'sess_1',
    originalUrl: 'https://x/y.jpg',
    widthPx: 4000,
    heightPx: 3000,
    mime: 'image/jpeg',
    bytes: 123456,
    exifStripped: true,
    status: 'ready',
    ...overrides,
  };
}

describe('UploadSchema', () => {
  it('accepts an upload with no userId (pre-login)', () => {
    const result = UploadSchema.safeParse(baseUpload());
    expect(result.success).toBe(true);
  });

  it('accepts an upload with userId set (post-reconciliation)', () => {
    const result = UploadSchema.safeParse(baseUpload({ userId: 'user_1' }));
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status value', () => {
    const result = UploadSchema.safeParse(baseUpload({ status: 'processing' }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive widthPx', () => {
    const result = UploadSchema.safeParse(baseUpload({ widthPx: 0 }));
    expect(result.success).toBe(false);
  });

  it('rejects a negative bytes value', () => {
    const result = UploadSchema.safeParse(baseUpload({ bytes: -1 }));
    expect(result.success).toBe(false);
  });

  it('rejects an empty sessionId', () => {
    const result = UploadSchema.safeParse(baseUpload({ sessionId: '' }));
    expect(result.success).toBe(false);
  });
});
