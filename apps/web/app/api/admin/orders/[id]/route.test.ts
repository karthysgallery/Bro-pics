import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockOrderGet = vi.fn();
const mockItemsGet = vi.fn();
const mockEventsGet = vi.fn();
const mockReturnsGet = vi.fn();
const mockReturnsWhere = vi.fn(() => ({ get: mockReturnsGet }));
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') {
      return {
        doc: vi.fn(() => ({
          id: 'order_1',
          get: mockOrderGet,
          collection: vi.fn((sub: string) => {
            if (sub === 'items') return { get: mockItemsGet };
            if (sub === 'events') return { orderBy: vi.fn(() => ({ get: mockEventsGet })) };
            throw new Error(`unexpected subcollection: ${sub}`);
          }),
        })),
      };
    }
    if (name === 'returns') {
      return { where: mockReturnsWhere };
    }
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1', { headers: { Authorization: authHeader } });
}

function makeParams(id = 'order_1') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/orders/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockOrderGet.mockResolvedValue({ exists: true, id: 'order_1', data: () => ({ orderNo: 'BP-2026-00001', status: 'paid', notes: 'Handle with care' }) });
    mockItemsGet.mockResolvedValue({ docs: [{ data: () => ({ id: 'item_1', title: 'Frame' }) }] });
    mockEventsGet.mockResolvedValue({ docs: [{ data: () => ({ id: 'event_1', status: 'paid' }) }] });
    mockReturnsGet.mockResolvedValue({ docs: [] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the order does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns the order, items, events, and returns together', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockReturnsGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'ret_1', status: 'refunded', razorpayRefundId: 'rfnd_1' }) }] });

    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.order).toEqual(expect.objectContaining({ id: 'order_1', orderNo: 'BP-2026-00001', notes: 'Handle with care' }));
    expect(body.items).toEqual([{ id: 'item_1', title: 'Frame' }]);
    expect(body.events).toEqual([{ id: 'event_1', status: 'paid' }]);
    expect(body.returns).toEqual([{ id: 'ret_1', status: 'refunded', razorpayRefundId: 'rfnd_1' }]);
  });

  it('queries returns by orderId equality', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await GET(makeRequest(), makeParams());
    expect(mockReturnsWhere).toHaveBeenCalledWith('orderId', '==', 'order_1');
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
