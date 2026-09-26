import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockQueryGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockQueryGet })) })), limit: vi.fn(() => ({ get: mockQueryGet })) })),
    limit: vi.fn(() => ({ get: mockQueryGet })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeTimestamp(iso: string) {
  return { toMillis: () => new Date(iso).getTime() };
}

function makeRequest(query = '', authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/notification-log${query}`, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/notification-log', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'entry_older', createdAt: makeTimestamp('2026-09-01T00:00:00.000Z') }) },
        { data: () => ({ id: 'entry_newer', createdAt: makeTimestamp('2026-09-10T00:00:00.000Z') }) },
      ],
    });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
  });

  it('returns 400 for an invalid status filter', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?status=bogus'));
    expect(response.status).toBe(400);
  });

  it('sorts entries newest first', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest());
    const body = await response.json();
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['entry_newer', 'entry_older']);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
