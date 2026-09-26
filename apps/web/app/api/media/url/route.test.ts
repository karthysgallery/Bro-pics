// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSignedReadUrl = vi.fn().mockResolvedValue('https://signed.example.com/fresh.jpg');
const mockUploadsWhereGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
const mockCustomizationsWhereGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });

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
    collection: (name: string) => ({
      where: () => ({
        limit: () => ({
          get: name === 'uploads' ? mockUploadsWhereGet : mockCustomizationsWhereGet,
        }),
      }),
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

function makeRequest(path: string, opts: { sessionId?: string; authHeader?: string } = {}): Request {
  const url = new URL('http://localhost/api/media/url');
  if (path) url.searchParams.set('path', path);
  return new Request(url, {
    headers: {
      ...(opts.sessionId ? { 'X-Session-Id': opts.sessionId } : {}),
      ...(opts.authHeader ? { Authorization: opts.authHeader } : {}),
    },
  });
}

describe('GET /api/media/url', () => {
  beforeEach(() => {
    resetRateLimitState();
    mockGetSignedReadUrl.mockClear();
    mockUploadsWhereGet.mockClear();
    mockUploadsWhereGet.mockResolvedValue({ empty: true, docs: [] });
    mockCustomizationsWhereGet.mockClear();
    mockCustomizationsWhereGet.mockResolvedValue({ empty: true, docs: [] });
    vi.mocked(getUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
    vi.mocked(getStaffUserIdFromAuthHeader).mockReset().mockResolvedValue(null);
  });

  it('mints a fresh signed URL when the caller\'s session owns the path', async () => {
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { sessionId: 'sess_1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://signed.example.com/fresh.jpg');
  });

  it('rejects a mismatched session', async () => {
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { sessionId: 'sess_evil' }));
    expect(response.status).toBe(403);
  });

  it('allows staff regardless of session', async () => {
    vi.mocked(getStaffUserIdFromAuthHeader).mockResolvedValueOnce('staff_1');
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { authHeader: 'Bearer staff-token' }));
    expect(response.status).toBe(200);
  });

  it('allows a signed-in user who owns the referenced upload doc, even with no session match', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_1');
    mockUploadsWhereGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ userId: 'user_1' }) }] });
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { authHeader: 'Bearer good-token' }));
    expect(response.status).toBe(200);
  });

  it("rejects a signed-in user who does not own the referenced upload doc", async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_2');
    mockUploadsWhereGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ userId: 'user_1' }) }] });
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { authHeader: 'Bearer good-token' }));
    expect(response.status).toBe(403);
  });

  it('rejects a missing path', async () => {
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(400);
  });

  it('rejects a path outside the uploads/ prefix', async () => {
    const response = await GET(makeRequest('print-files/order_1/item_1/print.png', { sessionId: 'sess_1' }));
    expect(response.status).toBe(400);
  });

  it('rejects a path containing ..', async () => {
    const response = await GET(makeRequest('uploads/sess_1/../../etc/passwd', { sessionId: 'sess_1' }));
    expect(response.status).toBe(400);
  });

  it('returns 429 without touching Storage when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest('uploads/sess_1/up_1/original.jpg', { sessionId: 'sess_1' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(mockGetSignedReadUrl).not.toHaveBeenCalled();
  });
});
