import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockUserGet = vi.fn();
const mockAddressesGet = vi.fn();
const mockOrdersGet = vi.fn();
const mockReviewsGet = vi.fn();
const mockCouponsGet = vi.fn();

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'users') {
      return {
        doc: vi.fn(() => ({
          get: mockUserGet,
          collection: vi.fn(() => ({ get: mockAddressesGet })),
        })),
      };
    }
    if (name === 'orders') {
      return { where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockOrdersGet })) })) })) };
    }
    if (name === 'reviews') {
      return { where: vi.fn(() => ({ get: mockReviewsGet })) };
    }
    if (name === 'coupons') {
      return { where: vi.fn(() => ({ get: mockCouponsGet })) };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/customers/user_1', { headers: { Authorization: authHeader } });
}

function makeParams(uid = 'user_1') {
  return { params: Promise.resolve({ uid }) };
}

describe('GET /api/admin/customers/[uid]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockUserGet.mockResolvedValue({ exists: true, data: () => ({ id: 'user_1', displayName: 'Priya' }) });
    mockAddressesGet.mockResolvedValue({ docs: [] });
    mockOrdersGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            id: 'order_1',
            orderNo: 'BP-2026-00001',
            total: 105000,
            razorpayOrderId: 'order_rzp_1',
            razorpayPaymentId: 'pay_1',
            amountPaidOnline: 105000,
            amountDueOnDelivery: 0,
          }),
        },
      ],
    });
    mockReviewsGet.mockResolvedValue({ docs: [] });
    mockCouponsGet.mockResolvedValue({ docs: [] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(403);
  });

  it('returns 404 when the customer does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockUserGet.mockResolvedValueOnce({ exists: false });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('strips payment fields from every order in the response', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toEqual([{ id: 'order_1', orderNo: 'BP-2026-00001', total: 105000 }]);
    expect(body.orders[0]).not.toHaveProperty('razorpayOrderId');
    expect(body.orders[0]).not.toHaveProperty('razorpayPaymentId');
    expect(body.orders[0]).not.toHaveProperty('amountPaidOnline');
    expect(body.orders[0]).not.toHaveProperty('amountDueOnDelivery');
  });

  it('returns the user, addresses, reviews, and coupons alongside orders', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();
    expect(body.user).toEqual({ id: 'user_1', displayName: 'Priya' });
    expect(body.addresses).toEqual([]);
    expect(body.reviews).toEqual([]);
    expect(body.coupons).toEqual([]);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
