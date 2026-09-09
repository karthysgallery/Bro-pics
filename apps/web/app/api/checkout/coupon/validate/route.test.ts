import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('server-only', () => ({}));

const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockFindCouponByCode = vi.fn();
vi.mock('../../../../../lib/coupon-lookup', () => ({
  findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args),
}));

const mockFindVariantById = vi.fn();
vi.mock('../../../../../lib/variant-lookup', () => ({
  findVariantById: (...args: unknown[]) => mockFindVariantById(...args),
}));

const mockCartDocGet = vi.fn();
// The route chains `.where().where().get()` (real Firestore Query objects
// support this), so the mock query object must return itself from `.where()`
// and only terminate the chain at `.get()`.
const mockOrdersGet = vi.fn();
const mockOrdersQuery: { where: ReturnType<typeof vi.fn>; get: typeof mockOrdersGet } = {
  where: vi.fn(),
  get: mockOrdersGet,
};
mockOrdersQuery.where.mockReturnValue(mockOrdersQuery);
function mockOrdersWhere(...args: unknown[]) {
  return mockOrdersQuery.where(...args);
}
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'carts') return { doc: vi.fn(() => ({ get: mockCartDocGet })) };
      if (name === 'orders') return { where: mockOrdersWhere };
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/checkout/coupon/validate', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const NOW_COUPON = {
  code: 'NEW10',
  type: 'percent' as const,
  value: 10,
  startsAt: new Date('2020-01-01T00:00:00.000Z'),
  endsAt: new Date('2030-01-01T00:00:00.000Z'),
  appliesTo: 'all' as const,
  usedCount: 0,
};

describe('POST /api/checkout/coupon/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCartDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame', qty: 1 }] }),
    });
    mockFindVariantById.mockResolvedValue({ id: 'v1', productId: 'prod_1', price: 100000, isActive: true, stockStatus: 'in_stock' });
    mockOrdersGet.mockResolvedValue({ size: 0 });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when code is missing', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 404 when the coupon does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ code: 'UNKNOWN' }));
    expect(response.status).toBe(404);
  });

  it('returns valid:true with the correct discount for a percent coupon', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce(NOW_COUPON);
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: true, discountPaise: 10000, freeShipping: false });
  });

  it('returns valid:false with the reason from calculateCouponDiscount when rejected', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, minOrder: 999999999 });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: false, reason: 'below_min_order' });
  });

  it('returns valid:false with per_user_limit_reached when the caller already used it up', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, perUserLimit: 1 });
    mockOrdersGet.mockResolvedValue({ size: 1 });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: false, reason: 'per_user_limit_reached' });
  });

  it('sets freeShipping true for a free_ship coupon', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, type: 'free_ship', value: 0 });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    const body = await response.json();
    expect(body).toEqual({ valid: true, discountPaise: 0, freeShipping: true });
  });
});
