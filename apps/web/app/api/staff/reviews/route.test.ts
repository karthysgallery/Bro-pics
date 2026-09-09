import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockReviewsGet = vi.fn();
const mockProductGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'reviews') {
        return { where: vi.fn(() => ({ get: mockReviewsGet })) };
      }
      if (name === 'products') {
        return { doc: vi.fn(() => ({ get: mockProductGet })) };
      }
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when status is missing or invalid', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns matching reviews with productTitle populated from a batch product lookup', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReviewsGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'review_1',
          data: () => ({
            productId: 'prod_1',
            userId: 'user_1',
            rating: 5,
            title: 'Great',
            body: 'Loved it',
            isVerified: true,
            status: 'pending',
            createdAt: '2026-09-09T00:00:00.000Z',
          }),
        },
      ],
    });
    mockProductGet.mockResolvedValueOnce({ exists: true, data: () => ({ title: 'Classic Wooden Photo Frame' }) });

    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reviews).toEqual([
      expect.objectContaining({ id: 'review_1', productId: 'prod_1', productTitle: 'Classic Wooden Photo Frame' }),
    ]);
  });
});
