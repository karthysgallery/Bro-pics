import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockCouponGet = vi.fn();
const mockCouponUpdate = vi.fn().mockResolvedValue(undefined);
const mockUserGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'coupons') return { doc: vi.fn(() => ({ get: mockCouponGet, update: mockCouponUpdate })) };
    if (name === 'users') return { doc: vi.fn(() => ({ get: mockUserGet })) };
    throw new Error(`Unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/coupons/SAVE10/assign', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(code = 'SAVE10') {
  return { params: Promise.resolve({ code }) };
}

describe('POST /api/admin/coupons/[code]/assign', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockCouponGet.mockResolvedValue({ exists: true });
    mockUserGet.mockResolvedValue({ exists: true });
  });

  it('returns 404 when the coupon does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCouponGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ userId: 'user_1' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('rejects a missing userId field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 400 when the userId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockUserGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ userId: 'user_missing' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockCouponUpdate).not.toHaveBeenCalled();
  });

  it('assigns the coupon to the user', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ userId: 'user_1' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockCouponUpdate).toHaveBeenCalledWith({ assignedUserId: 'user_1' });
  });

  it('unassigns the coupon when userId is null, without a user lookup', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ userId: null }), makeParams());
    expect(response.status).toBe(200);
    expect(mockCouponUpdate).toHaveBeenCalledWith({ assignedUserId: null });
    expect(mockUserGet).not.toHaveBeenCalled();
  });

  it('writes an audit log entry distinguishing assign vs unassign', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ userId: 'user_1' }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'coupon.assign', resourceId: 'SAVE10', details: { userId: 'user_1' } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ userId: 'user_1' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
