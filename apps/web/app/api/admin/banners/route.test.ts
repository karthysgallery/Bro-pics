import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindCouponByCode = vi.fn();
vi.mock('../../../../lib/coupon-lookup', () => ({ findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args) }));

const mockBannerSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'banner_new_1', set: mockBannerSet })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { title: 'Diwali Sale' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/banners', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/banners', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when the coupon code does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindCouponByCode.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ ...validBody, couponCode: 'MISSING10' }));
    expect(response.status).toBe(400);
    expect(mockBannerSet).not.toHaveBeenCalled();
  });

  it('creates the banner when the coupon code exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindCouponByCode.mockResolvedValueOnce({ code: 'DIWALI30' });
    const response = await POST(makeRequest({ ...validBody, couponCode: 'DIWALI30' }));
    expect(response.status).toBe(201);
    expect(mockBannerSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'banner_new_1', title: 'Diwali Sale', couponCode: 'DIWALI30' }));
  });

  it('creates the banner without a coupon lookup when couponCode is omitted', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockFindCouponByCode).not.toHaveBeenCalled();
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'banner.create', resource: 'banner', resourceId: 'banner_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
