import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockQueryGet = vi.fn();
const mockWhere = vi.fn(() => ({ where: mockWhere, limit: vi.fn(() => ({ get: mockQueryGet })) }));
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

function makeRequest(query: string, authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/customers${query}`, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/customers', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockQueryGet.mockResolvedValue({ docs: [{ data: () => ({ id: 'user_1', displayName: 'Priya' }) }] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await GET(makeRequest('?q=priya'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when q is missing', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(400);
  });

  it('searches by email when q contains @', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?q=priya@example.com'));
    expect(response.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledWith('email', '==', 'priya@example.com');
  });

  it('searches by phone when q is all digits', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?q=%2B919876543210'));
    expect(response.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledWith('phone', '==', '+919876543210');
  });

  it('searches by displayName prefix otherwise', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?q=Priya'));
    expect(response.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledWith('displayName', '>=', 'Priya');
    expect(mockWhere).toHaveBeenCalledWith('displayName', '<=', 'Priya');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest('?q=priya'));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
