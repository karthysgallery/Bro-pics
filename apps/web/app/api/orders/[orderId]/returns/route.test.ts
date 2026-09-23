import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockOrderGet = vi.fn();
const mockReturnsWhereGet = vi.fn();
const mockEventsWhereGet = vi.fn();
const mockReturnSet = vi.fn().mockResolvedValue(undefined);

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') {
      return {
        doc: vi.fn(() => ({
          get: mockOrderGet,
          collection: vi.fn((sub: string) => {
            if (sub === 'events') return { where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockEventsWhereGet })) })) };
            return {};
          }),
        })),
      };
    }
    if (name === 'returns') {
      return {
        where: vi.fn(() => ({ get: mockReturnsWhereGet })),
        doc: vi.fn(() => ({ id: 'ret_1', set: mockReturnSet })),
      };
    }
    return {};
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/orders/order_1/returns', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DELIVERED_ORDER = { userId: 'user_1', status: 'delivered', total: 105000 };

describe('POST /api/orders/[orderId]/returns', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockReturnsWhereGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(401);
  });

  it('returns 400 when reason is missing', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({}), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);
  });

  it('[BE-19] returns 400 when reasonCategory is missing or invalid', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);

    mockGetUserId.mockResolvedValueOnce('user_1');
    const response2 = await POST(makeRequest({ reason: 'damaged', reasonCategory: 'not_a_category' }), {
      params: Promise.resolve({ orderId: 'order_1' }),
    });
    expect(response2.status).toBe(400);
  });

  it('[BE-19] stores evidencePaths on the return doc when provided', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => DELIVERED_ORDER });
    mockEventsWhereGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ status: 'delivered', createdAt: new Date().toISOString() }) }],
    });

    const response = await POST(
      makeRequest({ reasonCategory: 'damaged', reason: 'Frame arrived damaged', evidencePaths: ['returns/ret_1/photo1.jpg'] }),
      { params: Promise.resolve({ orderId: 'order_1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockReturnSet).toHaveBeenCalledWith(
      expect.objectContaining({ evidencePaths: ['returns/ret_1/photo1.jpg'] })
    );
  });

  it('returns 404 when the order does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the order belongs to someone else', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...DELIVERED_ORDER, userId: 'someone_else' }) });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 when the order is not delivered', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...DELIVERED_ORDER, status: 'shipped' }) });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);
  });

  it('returns 409 when a return already exists for this order', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => DELIVERED_ORDER });
    mockReturnsWhereGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({}) }] });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(409);
  });

  it('returns 400 when outside the return window', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => DELIVERED_ORDER });
    mockEventsWhereGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ status: 'delivered', createdAt: '2020-01-01T00:00:00.000Z' }) }],
    });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(400);
    expect(mockReturnSet).not.toHaveBeenCalled();
  });

  it('creates a return request within the window, defaulting refundAmount to the order total', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => DELIVERED_ORDER });
    mockEventsWhereGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ status: 'delivered', createdAt: new Date().toISOString() }) }],
    });

    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'Frame arrived damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });

    expect(response.status).toBe(200);
    expect(mockReturnSet).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_1', userId: 'user_1', status: 'requested', refundAmount: 105000 })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ reasonCategory: 'damaged', reason: 'damaged' }), { params: Promise.resolve({ orderId: 'order_1' }) });
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});

describe('GET /api/orders/[orderId]/returns', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await GET(new Request('https://example.com/api/orders/order_1/returns'), {
      params: Promise.resolve({ orderId: 'order_1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for someone else\'s order', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...DELIVERED_ORDER, userId: 'someone_else' }) });
    const response = await GET(new Request('https://example.com/api/orders/order_1/returns'), {
      params: Promise.resolve({ orderId: 'order_1' }),
    });
    expect(response.status).toBe(404);
  });

  it('lists returns for the caller\'s own order', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => DELIVERED_ORDER });
    mockReturnsWhereGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'ret_1', status: 'requested' }) }] });
    const response = await GET(new Request('https://example.com/api/orders/order_1/returns'), {
      params: Promise.resolve({ orderId: 'order_1' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.returns).toEqual([{ id: 'ret_1', status: 'requested' }]);
  });
});
