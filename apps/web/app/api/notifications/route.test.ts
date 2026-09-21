import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => ({ get: mockGet })) })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../lib/rate-limit';

function makeSnapshot(docs: Array<Record<string, unknown>>) {
  return { docs: docs.map((data) => ({ data: () => data })) };
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await GET(new Request('https://example.com/api/notifications'));
    expect(response.status).toBe(401);
  });

  it('sorts newest first and reports the unread count', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'n1', createdAt: '2026-01-01T00:00:00.000Z', isRead: true },
        { id: 'n2', createdAt: '2026-03-01T00:00:00.000Z', isRead: false },
        { id: 'n3', createdAt: '2026-02-01T00:00:00.000Z', isRead: false },
      ])
    );
    const response = await GET(new Request('https://example.com/api/notifications'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(['n2', 'n3', 'n1']);
    expect(body.unreadCount).toBe(2);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 4 });
    const response = await GET(new Request('https://example.com/api/notifications'));
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
