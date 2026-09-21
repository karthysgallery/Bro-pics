import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockGet = vi.fn();
const mockWhere = vi.fn(() => ({ get: mockGet }));
const mockDb = {
  collection: vi.fn(() => ({ where: mockWhere })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/reviews/mine', { headers: { Authorization: authHeader } });
}

function makeSnapshot(docs: Array<Record<string, unknown>>) {
  return { docs: docs.map((data) => ({ data: () => data })) };
}

describe('GET /api/reviews/mine', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns the caller\'s own reviews across every status, newest first', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'r1', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', status: 'pending', createdAt: '2026-06-01T00:00:00.000Z' },
        { id: 'r3', status: 'rejected', createdAt: '2026-03-01T00:00:00.000Z' },
      ])
    );

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user_1');
    const body = await response.json();
    expect(body.reviews.map((r: { id: string }) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
