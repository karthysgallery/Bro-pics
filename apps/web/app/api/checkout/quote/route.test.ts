import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});
const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: (...a: unknown[]) => mockGetUserId(...a) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));
const mockCartGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => mockCartGet() }) }) }),
}));
const mockPricing = vi.fn();
vi.mock('../../../../lib/order-pricing', () => ({ computeOrderPricing: (...a: unknown[]) => mockPricing(...a) }));

import { POST } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const req = (body: unknown = {}) =>
  new Request('https://example.com/api/checkout/quote', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/checkout/quote', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetUserId.mockResolvedValue('user_1');
    mockCartGet.mockResolvedValue({ exists: true, data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }) });
  });

  it('401s when signed out', async () => {
    mockGetUserId.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
  });

  it('400s on an unsupported delivery method', async () => {
    expect((await POST(req({ deliveryMethod: 'same_day' }))).status).toBe(400);
  });

  it('answers {empty:true} for an empty cart without pricing anything', async () => {
    mockCartGet.mockResolvedValue({ exists: false });
    const res = await POST(req());
    expect(await res.json()).toEqual({ empty: true });
    expect(mockPricing).not.toHaveBeenCalled();
  });

  it('returns the server-computed totals for the signed-in user\'s own cart, passing coupon and delivery through', async () => {
    mockPricing.mockResolvedValue({
      priced: [{ variantId: 'v1', personalizationId: 'p1', unitPrice: 79900, qty: 1, title: 'x' }],
      unavailable: [], subtotal: 79900, discount: 8000, shipping: 5000, total: 76900,
      coupon: { requested: true, applied: true, code: 'TEN', freeShipping: false }, taxLines: [{ rate: 18, amount: 11731 }],
    });
    const res = await POST(req({ couponCode: ' TEN ', deliveryMethod: 'express' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ empty: false, subtotal: 79900, discount: 8000, shipping: 5000, total: 76900, coupon: { applied: true } });
    expect(mockPricing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 'user_1', couponCode: 'TEN', deliveryMethod: 'express' }));
  });

  it('surfaces unavailable lines so the page can tell the customer', async () => {
    mockPricing.mockResolvedValue({
      priced: [], unavailable: [{ variantId: 'v1', reason: 'out_of_stock' }], subtotal: 0, discount: 0, shipping: 0, total: 0,
      coupon: { requested: false }, taxLines: [],
    });
    const body = await (await POST(req())).json();
    expect(body.unavailable).toEqual([{ variantId: 'v1', reason: 'out_of_stock' }]);
  });

  it('429s when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 9 });
    expect((await POST(req())).status).toBe(429);
  });
});
