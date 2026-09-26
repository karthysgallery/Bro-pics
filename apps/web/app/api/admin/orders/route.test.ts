import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockUsersWhereGet = vi.fn();
const mockOrdersGet = vi.fn();
const mockOrdersWhere = vi.fn(() => ({ where: mockOrdersWhere, orderBy: mockOrdersOrderBy }));
const mockOrdersOrderBy = vi.fn(() => ({ startAfter: mockOrdersStartAfter, limit: mockOrdersLimit }));
const mockOrdersStartAfter = vi.fn(() => ({ limit: mockOrdersLimit }));
const mockOrdersLimit = vi.fn(() => ({ get: mockOrdersGet }));
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') {
      return { where: mockOrdersWhere, orderBy: mockOrdersOrderBy };
    }
    if (name === 'users') {
      return { where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockUsersWhereGet })) })) };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeOrderDoc(id: string, placedAtIso: string) {
  return {
    id,
    data: () => ({
      orderNo: `BP-${id}`,
      status: 'paid',
      total: 1000,
      placedAt: { toDate: () => new Date(placedAtIso) },
      addressJson: { city: 'Chennai' },
    }),
  };
}

function makeRequest(query: string, authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/orders${query}`, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/orders', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockOrdersGet.mockResolvedValue({ docs: [makeOrderDoc('order_1', '2026-09-01T00:00:00.000Z')] });
    mockUsersWhereGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 400 when status and q are both given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?status=paid&q=user@example.com'));
    expect(response.status).toBe(400);
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

  it('lists orders with default limit and no filter', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toEqual([
      expect.objectContaining({ id: 'order_1', orderNo: 'BP-order_1', status: 'paid', total: 1000 }),
    ]);
    expect(body.nextCursor).toBeNull();
    expect(mockOrdersLimit).toHaveBeenCalledWith(26);
  });

  it('filters by status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?status=paid'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('status', '==', 'paid');
  });

  it('resolves q by email and filters by the found userId', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockUsersWhereGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'user_1' }] });
    await GET(makeRequest('?q=user@example.com'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('userId', '==', 'user_1');
  });

  it('returns an empty list without querying orders when the search matches no user', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?q=nobody@example.com'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toEqual([]);
    expect(mockOrdersGet).not.toHaveBeenCalled();
  });

  it('applies from/to as placedAt range filters', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?from=2026-09-01T00:00:00.000Z&to=2026-09-30T00:00:00.000Z'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('placedAt', '>=', new Date('2026-09-01T00:00:00.000Z'));
    expect(mockOrdersWhere).toHaveBeenCalledWith('placedAt', '<=', new Date('2026-09-30T00:00:00.000Z'));
  });

  it('returns 400 for a malformed cursor', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('?cursor=not-a-cursor'));
    expect(response.status).toBe(400);
  });

  it('applies startAfter when a valid cursor is given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest('?cursor=2026-09-01T00:00:00.000Z_order_0'));
    expect(mockOrdersStartAfter).toHaveBeenCalledWith(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('returns a nextCursor when more results exist beyond the page', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrdersGet.mockResolvedValueOnce({
      docs: [
        makeOrderDoc('order_1', '2026-09-03T00:00:00.000Z'),
        makeOrderDoc('order_2', '2026-09-02T00:00:00.000Z'),
      ],
    });
    const response = await GET(makeRequest('?limit=1'));
    const body = await response.json();
    expect(body.orders).toHaveLength(1);
    expect(body.nextCursor).toBe('2026-09-03T00:00:00.000Z_order_1');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
