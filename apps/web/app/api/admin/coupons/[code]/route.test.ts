import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGetAll = vi.fn().mockResolvedValue([]);
const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'coupons') return { doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })) };
    return { doc: vi.fn((id: string) => ({ id })) };
  }),
  getAll: (...args: unknown[]) => mockGetAll(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentCoupon = { code: 'SAVE10', type: 'percent', value: 10, isActive: true, usedCount: 3 };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/coupons/SAVE10', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(code = 'SAVE10') {
  return { params: Promise.resolve({ code }) };
}

describe('PATCH /api/admin/coupons/[code]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockGet.mockResolvedValue({ exists: true, data: () => currentCoupon });
  });

  it('returns 404 when the coupon does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects a code field (immutable)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ code: 'NEWCODE' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects a usedCount field', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ usedCount: 999 }), makeParams());
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates only the given fields (the isActive toggle)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ isActive: false });
  });

  it('converts startsAt/endsAt ISO strings to Dates on update', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ startsAt: '2026-11-01T00:00:00.000Z' }), makeParams());
    const written = mockUpdate.mock.calls[0][0];
    expect(written.startsAt).toBeInstanceOf(Date);
  });

  it('returns 400 when a productId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGetAll.mockResolvedValueOnce([{ id: 'prod_missing', exists: false }]);
    const response = await PATCH(makeRequest({ productIds: ['prod_missing'] }), makeParams());
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('writes an audit log entry with the changed field names', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'coupon.update', resourceId: 'SAVE10', details: { changedFields: ['isActive'] } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ isActive: false }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
