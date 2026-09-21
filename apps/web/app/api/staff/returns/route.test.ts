import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockWhereGet = vi.fn();
const mockCollectionGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ get: mockWhereGet })),
    get: mockCollectionGet,
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

describe('GET /api/staff/returns', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(new Request('https://example.com/api/staff/returns'));
    expect(response.status).toBe(403);
  });

  it('returns every return when no status filter is given', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockCollectionGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'ret_1' }) }, { data: () => ({ id: 'ret_2' }) }] });
    const response = await GET(new Request('https://example.com/api/staff/returns'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.returns).toHaveLength(2);
  });

  it('filters by status when given', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockWhereGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'ret_1', status: 'requested' }) }] });
    const response = await GET(new Request('https://example.com/api/staff/returns?status=requested'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.returns).toEqual([{ id: 'ret_1', status: 'requested' }]);
  });

  it('returns 400 for an invalid status filter', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await GET(new Request('https://example.com/api/staff/returns?status=bogus'));
    expect(response.status).toBe(400);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await GET(new Request('https://example.com/api/staff/returns'));
    expect(response.status).toBe(429);
    expect(mockGetStaffUserId).not.toHaveBeenCalled();
  });
});
