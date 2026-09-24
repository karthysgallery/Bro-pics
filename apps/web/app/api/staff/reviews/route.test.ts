import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockReviewsGet = vi.fn();
const mockProductGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'reviews') {
        const chainable = { where: vi.fn(() => chainable), get: mockReviewsGet };
        return { where: vi.fn(() => chainable) };
      }
      if (name === 'products') {
        return { doc: vi.fn(() => ({ get: mockProductGet })) };
      }
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/reviews', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when status is missing or invalid', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns matching reviews with productTitle populated from a batch product lookup', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
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

  it('deduplicates product lookups when multiple reviews share the same productId', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
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
        {
          id: 'review_2',
          data: () => ({
            productId: 'prod_1', // Same productId as review_1
            userId: 'user_2',
            rating: 4,
            title: 'Good',
            body: 'Very nice',
            isVerified: true,
            status: 'pending',
            createdAt: '2026-09-10T00:00:00.000Z',
          }),
        },
        {
          id: 'review_3',
          data: () => ({
            productId: 'prod_2', // Different productId
            userId: 'user_3',
            rating: 3,
            title: 'Okay',
            body: 'It was fine',
            isVerified: true,
            status: 'pending',
            createdAt: '2026-09-11T00:00:00.000Z',
          }),
        },
      ],
    });
    mockProductGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ title: 'Frame A' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ title: 'Frame B' }) });

    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(200);
    const body = await response.json();

    // Verify all 3 reviews are returned with correct titles
    expect(body.reviews).toHaveLength(3);
    expect(body.reviews[0]).toEqual(
      expect.objectContaining({ id: 'review_1', productId: 'prod_1', productTitle: 'Frame A' })
    );
    expect(body.reviews[1]).toEqual(
      expect.objectContaining({ id: 'review_2', productId: 'prod_1', productTitle: 'Frame A' })
    );
    expect(body.reviews[2]).toEqual(
      expect.objectContaining({ id: 'review_3', productId: 'prod_2', productTitle: 'Frame B' })
    );

    // Prove deduplication: mockProductGet should be called exactly 2 times
    // (once for prod_1, once for prod_2), NOT 3 times
    expect(mockProductGet).toHaveBeenCalledTimes(2);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockReviewsGet).not.toHaveBeenCalled();
  });

  it('[ABE-22] returns 400 for an invalid rating filter', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending&rating=7'));
    expect(response.status).toBe(400);
  });

  it('[ABE-22] filters client-side by q over title and body', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockReviewsGet.mockResolvedValueOnce({
      docs: [
        { id: 'review_1', data: () => ({ productId: 'prod_1', userId: 'user_1', rating: 5, title: 'Great frame', body: 'Loved it', isVerified: true, status: 'pending', createdAt: 'x' }) },
        { id: 'review_2', data: () => ({ productId: 'prod_1', userId: 'user_2', rating: 4, title: 'Meh', body: 'It was okay', isVerified: true, status: 'pending', createdAt: 'x' }) },
      ],
    });
    mockProductGet.mockResolvedValue({ exists: true, data: () => ({ title: 'Frame' }) });

    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending&q=great'));
    const body = await response.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].id).toBe('review_1');
  });

  it('[ABE-22] returns featured/placement/moderationNote fields when present', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockReviewsGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'review_1',
          data: () => ({
            productId: 'prod_1', userId: 'user_1', rating: 5, title: 'Great', body: 'Loved it',
            isVerified: true, status: 'approved', createdAt: 'x', featured: true, placement: 'homepage', moderationNote: 'ok',
          }),
        },
      ],
    });
    mockProductGet.mockResolvedValueOnce({ exists: true, data: () => ({ title: 'Frame' }) });

    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=approved'));
    const body = await response.json();
    expect(body.reviews[0]).toEqual(
      expect.objectContaining({ featured: true, placement: 'homepage', moderationNote: 'ok' })
    );
  });
});
