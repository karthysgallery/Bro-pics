// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocGet = vi.fn();
const mockReadStorageImage = vi.fn();

vi.mock('../../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('../../../../../lib/image-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/image-proxy')>();
  return { ...actual, readStorageImage: (path: string, maxSide: number) => mockReadStorageImage(path, maxSide) };
});

vi.mock('server-only', () => ({}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: mockDocGet }),
    }),
  }),
}));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { GET } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const frameArt = { id: 'm_1', type: 'image', path: 'public/media/m_1/frame.png', isActive: true };

async function call(id = 'm_1', query = '') {
  return GET(new Request(`http://localhost/api/media/${id}/image${query}`), { params: Promise.resolve({ id }) });
}

describe('GET /api/media/[id]/image', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockDocGet.mockReset().mockResolvedValue({ exists: true, data: () => frameArt });
    mockReadStorageImage.mockReset().mockResolvedValue({ body: Buffer.from([7]), contentType: 'image/webp' });
  });

  it('serves public template artwork with a long public cache', async () => {
    const response = await call('m_1', '?w=900');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toContain('public');
    expect(mockReadStorageImage).toHaveBeenCalledWith('public/media/m_1/frame.png', 900);
  });

  it('never serves files outside the public prefix', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...frameArt, path: 'uploads/sess/u/original.jpg' }) });
    expect((await call()).status).toBe(404);
    expect(mockReadStorageImage).not.toHaveBeenCalled();
  });

  it('hides inactive media, videos and unknown ids', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...frameArt, isActive: false }) });
    expect((await call()).status).toBe(404);
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...frameArt, type: 'video' }) });
    expect((await call()).status).toBe(404);
    mockDocGet.mockResolvedValueOnce({ exists: false });
    expect((await call()).status).toBe(404);
  });

  it('rejects malformed ids before touching Firestore', async () => {
    expect((await call('a/b')).status).toBe(400);
    expect(mockDocGet).not.toHaveBeenCalled();
  });

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 3 });
    expect((await call()).status).toBe(429);
    expect(mockDocGet).not.toHaveBeenCalled();
  });
});
