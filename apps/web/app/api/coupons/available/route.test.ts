import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockListAllCoupons = vi.fn();
vi.mock('../../../../lib/coupon-lookup', () => ({
  listAllCoupons: (...args: unknown[]) => mockListAllCoupons(...args),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeCoupon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    code: 'NEW10',
    type: 'percent',
    value: 10,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    usedCount: 0,
    appliesTo: 'all',
    ...overrides,
  };
}

describe('GET /api/coupons/available', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await GET(new Request('https://example.com/api/coupons/available'));
    expect(response.status).toBe(401);
  });

  it('excludes coupons outside their date window', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockListAllCoupons.mockResolvedValueOnce([
      makeCoupon({ code: 'EXPIRED', endsAt: new Date('2020-01-01') }),
      makeCoupon({ code: 'NOT_STARTED', startsAt: new Date('2099-01-01') }),
      makeCoupon({ code: 'ACTIVE' }),
    ]);
    const response = await GET(new Request('https://example.com/api/coupons/available'));
    const body = await response.json();
    expect(body.coupons.map((c: { code: string }) => c.code)).toEqual(['ACTIVE']);
  });

  it('excludes a coupon that has hit its usage limit', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockListAllCoupons.mockResolvedValueOnce([makeCoupon({ code: 'MAXED', usageLimit: 5, usedCount: 5 })]);
    const response = await GET(new Request('https://example.com/api/coupons/available'));
    const body = await response.json();
    expect(body.coupons).toEqual([]);
  });

  it('returns 429 and skips the lookup when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 4 });
    const response = await GET(new Request('https://example.com/api/coupons/available'));
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
