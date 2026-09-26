import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGetAll = vi.fn().mockResolvedValue([]);
const mockCouponGet = vi.fn();
const mockCouponSet = vi.fn().mockResolvedValue(undefined);
const mockCouponsQueryGet = vi.fn();

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'coupons') {
      return {
        doc: vi.fn(() => ({ get: mockCouponGet, set: mockCouponSet })),
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockCouponsQueryGet })) })),
        limit: vi.fn(() => ({ get: mockCouponsQueryGet })),
      };
    }
    return { doc: vi.fn((id: string) => ({ id })) };
  }),
  getAll: (...args: unknown[]) => mockGetAll(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = {
  code: 'save10',
  type: 'percent',
  value: 10,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  appliesTo: 'all',
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/coupons', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/coupons', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockCouponGet.mockResolvedValue({ exists: false });
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

  it('returns 409 when the code already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCouponGet.mockResolvedValueOnce({ exists: true });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    expect(mockCouponSet).not.toHaveBeenCalled();
  });

  it('returns 400 when a categoryId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGetAll.mockResolvedValueOnce([{ id: 'cat_missing', exists: false }]);
    const response = await POST(makeRequest({ ...validBody, appliesTo: 'category', categoryIds: ['cat_missing'] }));
    expect(response.status).toBe(400);
    expect(mockCouponSet).not.toHaveBeenCalled();
  });

  it('normalizes the code to uppercase and sets usedCount to 0', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockCouponSet).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE10', usedCount: 0, isActive: true }));
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'coupon.create', resource: 'coupon', resourceId: 'SAVE10' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/coupons', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockCouponsQueryGet.mockResolvedValue({ docs: [{ data: () => ({ code: 'SAVE10' }) }] });
  });

  function makeGetRequest(query = '', authHeader = 'Bearer good-token'): Request {
    return new Request(`https://example.com/api/admin/coupons${query}`, { headers: { Authorization: authHeader } });
  }

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(403);
  });

  it('returns the coupon list', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body.coupons).toEqual([{ code: 'SAVE10' }]);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
