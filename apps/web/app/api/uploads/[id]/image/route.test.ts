// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocGet = vi.fn();
const mockReadStorageImage = vi.fn();

vi.mock('../../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: vi.fn().mockResolvedValue(null),
  getStaffUserIdFromAuthHeader: vi.fn().mockResolvedValue(null),
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
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const readyUpload = {
  id: 'up_1',
  sessionId: 'sess_1',
  originalPath: 'uploads/sess_1/up_1/original.jpg',
  widthPx: 2400,
  heightPx: 3600,
  mime: 'image/jpeg',
  bytes: 12345,
  exifStripped: true,
  status: 'ready' as const,
};

function makeRequest(opts: { sessionId?: string; authHeader?: string; query?: string } = {}): Request {
  return new Request(`http://localhost/api/uploads/up_1/image${opts.query ?? ''}`, {
    headers: {
      ...(opts.sessionId ? { 'X-Session-Id': opts.sessionId } : {}),
      ...(opts.authHeader ? { Authorization: opts.authHeader } : {}),
    },
  });
}

async function call(request: Request, id = 'up_1') {
  return GET(request, { params: Promise.resolve({ id }) });
}

describe('GET /api/uploads/[id]/image', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockDocGet.mockReset().mockResolvedValue({ exists: true, data: () => readyUpload });
    mockReadStorageImage.mockReset().mockResolvedValue({ body: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' });
    vi.mocked(getUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
    vi.mocked(getStaffUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
  });

  it('streams the photo to the session that uploaded it, privately cached', async () => {
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=600');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockReadStorageImage).toHaveBeenCalledWith('uploads/sess_1/up_1/original.jpg', 2000);
  });

  it('caps the requested width', async () => {
    await call(makeRequest({ sessionId: 'sess_1', query: '?w=99999' }));
    expect(mockReadStorageImage).toHaveBeenCalledWith(expect.any(String), 2400);
  });

  it('refuses another session', async () => {
    const response = await call(makeRequest({ sessionId: 'sess_evil' }));
    expect(response.status).toBe(403);
    expect(mockReadStorageImage).not.toHaveBeenCalled();
  });

  it('refuses a request with no identity at all', async () => {
    const response = await call(makeRequest());
    expect(response.status).toBe(403);
  });

  it('allows the signed-in owner and staff', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...readyUpload, userId: 'user_1' }) });
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_1');
    expect((await call(makeRequest({ sessionId: 'other', authHeader: 'Bearer t' }))).status).toBe(200);

    vi.mocked(getStaffUserIdFromAuthHeader).mockResolvedValueOnce('staff_1');
    expect((await call(makeRequest({ authHeader: 'Bearer staff' }))).status).toBe(200);
  });

  it('rejects malformed ids before touching Firestore', async () => {
    const response = await call(makeRequest({ sessionId: 'sess_1' }), '../secret');
    expect(response.status).toBe(400);
    expect(mockDocGet).not.toHaveBeenCalled();
  });

  it('does not serve an upload that is not ready', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...readyUpload, status: 'rejected' }) });
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(409);
    expect(mockReadStorageImage).not.toHaveBeenCalled();
  });

  it('returns 404 when the file cannot be read', async () => {
    mockReadStorageImage.mockRejectedValueOnce(new Error('No such object'));
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(404);
  });

  it('returns 429 without reading Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(429);
    expect(mockDocGet).not.toHaveBeenCalled();
  });
});
