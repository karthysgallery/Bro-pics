import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrder = vi.fn();
vi.mock('../../../../../lib/order-lookup', () => ({ findOrderByOrderNo: (...args: unknown[]) => mockFindOrder(...args) }));

const mockItemsGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => ({ get: mockItemsGet })) })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/orders/BP-2026-00001', { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/orders/[orderNo]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 when no order matches the order number', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce(null);
    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-99999' }) });
    expect(response.status).toBe(404);
  });

  it('returns the order and its items on success', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } });
    mockItemsGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'item_1', title: 'Frame' }) }] });

    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.order).toEqual({ orderNo: 'BP-2026-00001', status: 'paid' });
    expect(body.items).toEqual([{ id: 'item_1', title: 'Frame' }]);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockFindOrder).not.toHaveBeenCalled();
  });
});
