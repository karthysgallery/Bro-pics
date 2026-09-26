// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocGet = vi.fn();
const mockGetSignedReadUrl = vi.fn().mockResolvedValue('https://signed.example.com/fresh.jpg');

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: vi.fn().mockResolvedValue(null),
  getStaffUserIdFromAuthHeader: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../lib/storage-url', () => ({
  getSignedReadUrl: (path: string) => mockGetSignedReadUrl(path),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: mockDocGet }),
    }),
  }),
}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { GET } from './route';
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

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

function makeRequest(opts: { sessionId?: string; authHeader?: string } = {}): Request {
  return new Request('http://localhost/api/uploads/up_1', {
    headers: {
      ...(opts.sessionId ? { 'X-Session-Id': opts.sessionId } : {}),
      ...(opts.authHeader ? { Authorization: opts.authHeader } : {}),
    },
  });
}

async function call(request: Request, id = 'up_1') {
  return GET(request, { params: Promise.resolve({ id }) });
}

describe('GET /api/uploads/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockDocGet.mockReset().mockResolvedValue({ exists: true, data: () => readyUpload });
    mockGetSignedReadUrl.mockClear();
    vi.mocked(getUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
    vi.mocked(getStaffUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
  });

  it('returns status, dimensions and a fresh preview URL for the owning session', async () => {
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.widthPx).toBe(2400);
    expect(body.previewUrl).toBe('https://signed.example.com/fresh.jpg');
  });

  it('returns 404 for an unknown id', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(404);
  });

  it('returns 403 for a session mismatch with no auth', async () => {
    const response = await call(makeRequest({ sessionId: 'sess_evil' }));
    expect(response.status).toBe(403);
  });

  it('allows staff regardless of session', async () => {
    vi.mocked(getStaffUserIdFromAuthHeader).mockResolvedValueOnce('staff_1');
    const response = await call(makeRequest({ authHeader: 'Bearer staff-token' }));
    expect(response.status).toBe(200);
  });

  it('allows the owning signed-in user even with a session mismatch', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...readyUpload, userId: 'user_1' }) });
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_1');
    const response = await call(makeRequest({ sessionId: 'sess_evil', authHeader: 'Bearer good-token' }));
    expect(response.status).toBe(200);
  });

  it('does not mint a preview URL for a non-ready upload', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...readyUpload, status: 'rejected' }) });
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.previewUrl).toBeNull();
    expect(mockGetSignedReadUrl).not.toHaveBeenCalled();
  });

  it('returns 429 without reading Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await call(makeRequest({ sessionId: 'sess_1' }));
    expect(response.status).toBe(429);
    expect(mockDocGet).not.toHaveBeenCalled();
  });
});
