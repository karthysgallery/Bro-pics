import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockOrdersGet = vi.fn();
const mockOrdersLimit = vi.fn(() => ({ get: mockOrdersGet }));
const mockOrdersOrderBy = vi.fn(() => ({ limit: mockOrdersLimit }));
const mockOrdersWhere = vi.fn(() => ({ where: mockOrdersWhere, orderBy: mockOrdersOrderBy }));
const mockDb = {
  collection: vi.fn(() => ({ where: mockOrdersWhere, orderBy: mockOrdersOrderBy })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeOrderDoc(overrides: Partial<{ orderNo: string; status: string; paymentStatus: string; total: number; userId: string }>) {
  return {
    data: () => ({
      orderNo: 'BP-2026-00001',
      status: 'paid',
      paymentStatus: 'paid',
      total: 150000,
      userId: 'user_1',
      placedAt: { toDate: () => new Date('2026-09-01T00:00:00.000Z') },
      ...overrides,
    }),
  };
}

function makeRequest(query: string, authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/orders/export${query}`, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/orders/export', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockOrdersGet.mockResolvedValue({ docs: [makeOrderDoc({})] });
  });

  it('rejects paymentStatus as an unsupported filter', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?paymentStatus=paid'));
    expect(response.status).toBe(400);
    expect(mockOrdersGet).not.toHaveBeenCalled();
  });

  it('rejects an invalid status value', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns a CSV with a header row and one row per order', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="orders-export-');
    const body = await response.text();
    const lines = body.split('\n');
    expect(lines[0]).toBe('orderNo,status,paymentStatus,total,placedAt,userId');
    expect(lines[1]).toBe('BP-2026-00001,paid,paid,150000,2026-09-01T00:00:00.000Z,user_1');
  });

  it('quotes and escapes a field containing a comma or quote', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrdersGet.mockResolvedValueOnce({ docs: [makeOrderDoc({ orderNo: 'BP-2026-00002', status: 'note, with "quotes"' })] });
    const response = await GET(makeRequest(''));
    const body = await response.text();
    expect(body).toContain('"note, with ""quotes"""');
  });

  it('filters by status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?status=paid'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('status', '==', 'paid');
  });

  it('applies from/to as placedAt range filters', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?from=2026-09-01T00:00:00.000Z&to=2026-09-30T00:00:00.000Z'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('placedAt', '>=', new Date('2026-09-01T00:00:00.000Z'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('placedAt', '<=', new Date('2026-09-30T00:00:00.000Z'));
  });

  it('caps the query at the export row limit', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest(''));
    expect(mockOrdersLimit).toHaveBeenCalledWith(5000);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
