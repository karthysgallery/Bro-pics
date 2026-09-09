import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetUserId = vi.fn();
vi.mock('../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockFindVerifiedPurchase = vi.fn();
vi.mock('../../../lib/order-lookup', () => ({
  findVerifiedPurchase: (...args: unknown[]) => mockFindVerifiedPurchase(...args),
}));

const mockDuplicateGet = vi.fn();
const mockSet = vi.fn();
const mockProductGet = vi.fn();
const mockDocId = 'review_generated_id';
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'products') {
        return { doc: vi.fn(() => ({ get: mockProductGet })) };
      }
      if (name === 'reviews') {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => ({ get: mockDuplicateGet })),
            })),
          })),
          doc: vi.fn(() => ({ id: mockDocId, set: mockSet })),
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

import { POST } from './route';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/reviews', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDuplicateGet.mockResolvedValue({ empty: true });
    mockProductGet.mockResolvedValue({ exists: true });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when a required field is missing', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when rating is out of range', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 6, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when productId does not correspond to an existing product', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockProductGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ productId: 'fabricated_prod', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(404);
  });

  it('returns 409 when the user already reviewed this product', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockDuplicateGet.mockResolvedValueOnce({ empty: false });
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(409);
  });

  it('creates a pending review with isVerified true when a matching order exists', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindVerifiedPurchase.mockResolvedValueOnce({ orderId: 'order_1' });
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ id: mockDocId, status: 'pending' });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ isVerified: true, orderId: 'order_1', status: 'pending', userId: 'user_1', productId: 'prod_1' })
    );
  });

  it('creates a pending review with isVerified false when no matching order exists', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindVerifiedPurchase.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 4, title: 'Nice', body: 'Pretty good' }));
    expect(response.status).toBe(200);
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.isVerified).toBe(false);
    expect('orderId' in setArg).toBe(false);
  });
});
