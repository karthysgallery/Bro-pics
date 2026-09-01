import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example.com/preview.png']);

beforeEach(() => {
  mockSave.mockClear();
  mockGetSignedUrl.mockClear();
});

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: mockSave, getSignedUrl: mockGetSignedUrl }),
    }),
  }),
}));

import { POST } from './route';

describe('POST /api/uploads/preview', () => {
  it('decodes a data URL, stores it, and returns a signed preview URL', async () => {
    // 1x1 transparent PNG, base64-encoded — a real, valid (if tiny) PNG data URL.
    const tinyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0, dataUrl: tinyPngDataUrl }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.previewUrl).toBe('https://signed.example.com/preview.png');
    expect(mockSave).toHaveBeenCalled();
  });

  it('rejects a request missing dataUrl', async () => {
    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects a dataUrl that does not match the data:image/*;base64,... format', async () => {
    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0, dataUrl: 'not-a-data-url' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('rejects a validly-formatted data URL whose decoded bytes are not a real image', async () => {
    // Well-formed data URL prefix, but the payload decodes to garbage bytes, not a real image.
    const bogusDataUrl = 'data:image/png;base64,' + Buffer.from('not a real image').toString('base64');

    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0, dataUrl: bogusDataUrl }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
