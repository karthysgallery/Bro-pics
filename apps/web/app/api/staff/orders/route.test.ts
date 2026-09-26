import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrdersByStatus = vi.fn();
vi.mock('../../../../lib/order-lookup', () => ({
  findOrdersByStatus: (...args: unknown[]) => mockFindOrdersByStatus(...args),
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/orders', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=paid'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when status is missing', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('https://example.com/api/staff/orders'));
    expect(response.status).toBe(400);
  });

  it('returns 400 when status is not a valid OrderStatus', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns the matching orders on a valid status', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrdersByStatus.mockResolvedValueOnce([
      {
        id: 'order_1',
        data: {
          orderNo: 'BP-2026-00001',
          status: 'paid',
          total: 150000,
          placedAt: '2026-09-01T00:00:00.000Z',
          addressJson: { city: 'Chennai' },
        },
      },
    ]);
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=paid'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toEqual([
      { id: 'order_1', orderNo: 'BP-2026-00001', status: 'paid', total: 150000, placedAt: '2026-09-01T00:00:00.000Z', addressJson: { city: 'Chennai' } },
    ]);
    expect(mockFindOrdersByStatus).toHaveBeenCalledWith(expect.anything(), 'paid');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=paid'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockFindOrdersByStatus).not.toHaveBeenCalled();
  });
});
