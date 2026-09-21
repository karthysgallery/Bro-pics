import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockGet = vi.fn();
const mockDocSet = vi.fn();
const mockDocDelete = vi.fn();
const mockDoc = vi.fn(() => ({ set: mockDocSet, delete: mockDocDelete }));
const mockCollection = vi.fn(() => ({ doc: mockDoc, get: mockGet }));
const mockDb = { collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: mockCollection })) })) };
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../lib/rate-limit';

function makeSnapshot(ids: string[]) {
  return { docs: ids.map((id) => ({ id })) };
}

describe('/api/wishlist', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns 401 when signed out', async () => {
      mockGetUserId.mockResolvedValueOnce(null);
      const response = await GET(new Request('https://example.com/api/wishlist'));
      expect(response.status).toBe(401);
    });

    it('returns the caller\'s wishlisted product ids', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockGet.mockResolvedValueOnce(makeSnapshot(['p1', 'p2']));
      const response = await GET(new Request('https://example.com/api/wishlist', { headers: { Authorization: 'Bearer t' } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.productIds).toEqual(['p1', 'p2']);
    });

    it('returns 429 when rate-limited', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 10 });
      const response = await GET(new Request('https://example.com/api/wishlist'));
      expect(response.status).toBe(429);
      expect(mockGetUserId).not.toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('returns 400 when productId is missing', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      const response = await POST(
        new Request('https://example.com/api/wishlist', { method: 'POST', body: JSON.stringify({}) })
      );
      expect(response.status).toBe(400);
    });

    it('adds the product and returns the updated list', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockGet.mockResolvedValueOnce(makeSnapshot(['p1']));
      const response = await POST(
        new Request('https://example.com/api/wishlist', { method: 'POST', body: JSON.stringify({ productId: 'p1' }) })
      );
      expect(response.status).toBe(200);
      expect(mockDoc).toHaveBeenCalledWith('p1');
      expect(mockDocSet).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 400 when productId query param is missing', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      const response = await DELETE(new Request('https://example.com/api/wishlist', { method: 'DELETE' }));
      expect(response.status).toBe(400);
    });

    it('removes the product and returns the updated list', async () => {
      mockGetUserId.mockResolvedValueOnce('user_1');
      mockGet.mockResolvedValueOnce(makeSnapshot([]));
      const response = await DELETE(new Request('https://example.com/api/wishlist?productId=p1', { method: 'DELETE' }));
      expect(response.status).toBe(200);
      expect(mockDoc).toHaveBeenCalledWith('p1');
      expect(mockDocDelete).toHaveBeenCalled();
    });
  });
});
