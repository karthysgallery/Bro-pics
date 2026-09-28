import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockOrdersWhereGet = vi.fn();
const mockReviewsWhereGet = vi.fn();
const mockItemsGetByOrderId = new Map<string, ReturnType<typeof vi.fn>>();
const mockProductGetByProductId = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'orders') {
        return {
          where: () => ({ get: mockOrdersWhereGet }),
          doc: (orderId: string) => ({
            collection: () => ({ get: mockItemsGetByOrderId.get(orderId) ?? vi.fn().mockResolvedValue({ docs: [] }) }),
          }),
        };
      }
      if (name === 'reviews') {
        return { where: () => ({ get: mockReviewsWhereGet }) };
      }
      if (name === 'products') {
        return {
          doc: (productId: string) => ({
            get: mockProductGetByProductId.get(productId) ?? vi.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  }),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/reviews/pending', { headers: { Authorization: authHeader } });
}

function makeSnapshot(docs: Array<Record<string, unknown>>) {
  return { docs: docs.map((data) => ({ data: () => data })) };
}

describe('GET /api/reviews/pending', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockItemsGetByOrderId.clear();
    mockProductGetByProductId.clear();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('lists a delivered order item with no existing review, resolving its product slug', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrdersWhereGet.mockResolvedValueOnce(
      makeSnapshot([{ id: 'order_1', userId: 'user_1', status: 'delivered' }])
    );
    mockReviewsWhereGet.mockResolvedValueOnce(makeSnapshot([]));
    mockItemsGetByOrderId.set(
      'order_1',
      vi.fn().mockResolvedValue(makeSnapshot([{ productId: 'prod_1', title: 'Classic Wooden Frame' }]))
    );
    mockProductGetByProductId.set('prod_1', vi.fn().mockResolvedValue({ exists: true, data: () => ({ slug: 'classic-wooden-frame' }) }));

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pending).toEqual([
      { productId: 'prod_1', title: 'Classic Wooden Frame', orderId: 'order_1', slug: 'classic-wooden-frame' },
    ]);
  });

  it('excludes a product the customer has already reviewed', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrdersWhereGet.mockResolvedValueOnce(
      makeSnapshot([{ id: 'order_1', userId: 'user_1', status: 'delivered' }])
    );
    mockReviewsWhereGet.mockResolvedValueOnce(makeSnapshot([{ productId: 'prod_1', status: 'pending' }]));
    mockItemsGetByOrderId.set(
      'order_1',
      vi.fn().mockResolvedValue(makeSnapshot([{ productId: 'prod_1', title: 'Classic Wooden Frame' }]))
    );

    const response = await GET(makeRequest());
    const body = await response.json();
    expect(body.pending).toEqual([]);
  });

  it('excludes items from a non-delivered order', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrdersWhereGet.mockResolvedValueOnce(
      makeSnapshot([{ id: 'order_1', userId: 'user_1', status: 'shipped' }])
    );
    mockReviewsWhereGet.mockResolvedValueOnce(makeSnapshot([]));

    const response = await GET(makeRequest());
    const body = await response.json();
    expect(body.pending).toEqual([]);
  });

  it('deduplicates the same product across two delivered orders', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockOrdersWhereGet.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'order_1', userId: 'user_1', status: 'delivered' },
        { id: 'order_2', userId: 'user_1', status: 'delivered' },
      ])
    );
    mockReviewsWhereGet.mockResolvedValueOnce(makeSnapshot([]));
    mockItemsGetByOrderId.set(
      'order_1',
      vi.fn().mockResolvedValue(makeSnapshot([{ productId: 'prod_1', title: 'Classic Wooden Frame' }]))
    );
    mockItemsGetByOrderId.set(
      'order_2',
      vi.fn().mockResolvedValue(makeSnapshot([{ productId: 'prod_1', title: 'Classic Wooden Frame' }]))
    );
    mockProductGetByProductId.set('prod_1', vi.fn().mockResolvedValue({ exists: true, data: () => ({ slug: 'classic-wooden-frame' }) }));

    const response = await GET(makeRequest());
    const body = await response.json();
    expect(body.pending).toHaveLength(1);
  });
});
