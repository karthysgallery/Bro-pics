// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example.com/original.jpg']);

// variant_2400 has minUploadPx 2400 — the server-side gate a client can no
// longer bypass by sending its own minUploadPx (see Finding 7 in review).
const variantDoc = { id: 'var_1', minUploadPx: 2400 };
const mockCollectionGroupGet = vi.fn().mockResolvedValue({ empty: false, docs: [{ data: () => variantDoc }] });

vi.mock('../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ id: 'up_test123', set: mockSet }),
    }),
    collectionGroup: () => ({
      where: () => ({
        limit: () => ({
          get: mockCollectionGroupGet,
        }),
      }),
    }),
  }),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: mockSave, getSignedUrl: mockGetSignedUrl }),
    }),
  }),
}));

import { POST } from './route';

const fixturesDir = join(__dirname, '..', '..', '..', '__fixtures__');

function makeRequest(fileBuffer: Buffer, sessionId: string, variantId = 'var_1'): Request {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' }), 'photo.jpg');
  formData.append('variantId', variantId);
  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: formData,
  });
}

describe('POST /api/uploads', () => {
  beforeEach(() => {
    mockCollectionGroupGet.mockClear();
    mockCollectionGroupGet.mockResolvedValue({ empty: false, docs: [{ data: () => variantDoc }] });
  });

  it('accepts a print-quality photo and returns a ready upload', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'sess_test'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.widthPx).toBe(2400);
    expect(body.heightPx).toBe(3600);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', sessionId: 'sess_test' }));
  });

  it('rejects a photo below the variant minUploadPx', async () => {
    const buffer = readFileSync(join(fixturesDir, 'tiny-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'sess_test'));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.status).toBe('rejected');
  });

  it('returns 400 for a malformed/undecodable image without writing to Firestore', async () => {
    mockSet.mockClear();
    const buffer = Buffer.from('this is not a valid image, just plain text bytes');
    const response = await POST(makeRequest(buffer, 'sess_test'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('requires a session ID header', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      body: (() => {
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), 'photo.jpg');
        fd.append('variantId', 'var_1');
        return fd;
      })(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects with 400 when variantId does not resolve to a real variant, without probing the image', async () => {
    mockCollectionGroupGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'sess_test', 'var_does_not_exist'));
    expect(response.status).toBe(400);
  });

  it('ignores a client-supplied minUploadPx and uses the server-fetched variant\'s value instead', async () => {
    // A "tiny" photo (300x450) would pass a client-lied minUploadPx of 1,
    // but must still be rejected using the server-side variant's real
    // minUploadPx (2400) — the whole point of Finding 7's fix.
    const buffer = readFileSync(join(fixturesDir, 'tiny-photo.jpg'));
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), 'photo.jpg');
    formData.append('variantId', 'var_1');
    formData.append('minUploadPx', '1'); // attempted bypass — must be ignored
    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { 'X-Session-Id': 'sess_test' },
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
  });
});
