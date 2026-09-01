import { describe, it, expect } from 'vitest';
import { UploadSchema } from './upload';

const validUpload = {
  id: 'up_1',
  sessionId: 'sess_abc123',
  originalUrl: 'https://storage.example.com/uploads/sess_abc123/up_1/original.jpg',
  widthPx: 2400,
  heightPx: 3600,
  mime: 'image/jpeg',
  bytes: 1_048_576,
  exifStripped: true,
  status: 'ready' as const,
};

describe('UploadSchema', () => {
  it('accepts a valid ready upload', () => {
    expect(UploadSchema.parse(validUpload)).toEqual(validUpload);
  });

  it('accepts a rejected upload', () => {
    const rejected = { ...validUpload, status: 'rejected' as const };
    expect(UploadSchema.parse(rejected)).toEqual(rejected);
  });

  it('rejects an unknown status', () => {
    const invalid = { ...validUpload, status: 'pending' };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects a non-positive widthPx', () => {
    const invalid = { ...validUpload, widthPx: 0 };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative bytes value', () => {
    const invalid = { ...validUpload, bytes: -1 };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty sessionId', () => {
    const invalid = { ...validUpload, sessionId: '' };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });
});
