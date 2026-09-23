import { describe, it, expect } from 'vitest';
import { parseStoragePathFromUrl } from './parse-storage-path-from-url';

const BUCKET = 'bropics-app.firebasestorage.app';

describe('parseStoragePathFromUrl', () => {
  it('extracts the object path from a real signed URL shape', () => {
    const url =
      'https://storage.googleapis.com/bropics-app.firebasestorage.app/uploads/sess_1/up_1/original.jpg?GoogleAccessId=x&Expires=1234&Signature=abc%3D%3D';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBe('uploads/sess_1/up_1/original.jpg');
  });

  it('extracts a nested preview path', () => {
    const url =
      'https://storage.googleapis.com/bropics-app.firebasestorage.app/uploads/sess_1/previews/pers_1/slot-0.png?GoogleAccessId=x&Expires=1&Signature=y';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBe('uploads/sess_1/previews/pers_1/slot-0.png');
  });

  it('returns null for a URL on a different host', () => {
    const url = 'https://example.com/uploads/sess_1/up_1/original.jpg';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBeNull();
  });

  it('returns null for a URL on storage.googleapis.com but a different bucket', () => {
    const url = 'https://storage.googleapis.com/some-other-bucket/uploads/sess_1/up_1/original.jpg?Signature=x';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBeNull();
  });

  it('returns null for a non-URL string', () => {
    expect(parseStoragePathFromUrl('not a url at all', BUCKET)).toBeNull();
  });

  it('returns null for an empty object path', () => {
    const url = 'https://storage.googleapis.com/bropics-app.firebasestorage.app/?Signature=x';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBeNull();
  });

  it('decodes a URL-encoded path segment', () => {
    const url = 'https://storage.googleapis.com/bropics-app.firebasestorage.app/uploads/sess%201/up_1/original.jpg?Signature=x';
    expect(parseStoragePathFromUrl(url, BUCKET)).toBe('uploads/sess 1/up_1/original.jpg');
  });

  it('already-a-path (not a URL at all) is correctly rejected, not passed through', () => {
    // A defensive case: if this migration ever runs twice, or a doc was
    // already converted, the "URL" field might actually already be a bare
    // path. That's not this function's job to detect — the migration
    // script itself must check for an existing *Path field first (BE-05a's
    // idempotency requirement) before ever calling this.
    expect(parseStoragePathFromUrl('uploads/sess_1/up_1/original.jpg', BUCKET)).toBeNull();
  });
});
