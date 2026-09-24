import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindCouponByCode = vi.fn();
vi.mock('../../../../../lib/coupon-lookup', () => ({ findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args) }));

const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentBanner = { id: 'banner_1', title: 'Old Title', couponCode: null, isActive: true, sortOrder: 0 };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/banners/banner_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'banner_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/banners/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true, data: () => currentBanner });
  });

  it('returns 404 when the banner does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ title: 'New Title' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 400 when the new coupon code does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindCouponByCode.mockResolvedValueOnce(null);
    const response = await PATCH(makeRequest({ couponCode: 'MISSING10' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates only the given fields', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ title: 'New Title' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ title: 'New Title' });
  });

  it('writes an audit log entry with the changed field names', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'banner.update', resourceId: 'banner_1', details: { changedFields: ['isActive'] } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ title: 'New Title' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
