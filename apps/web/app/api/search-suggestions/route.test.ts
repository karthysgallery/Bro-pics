import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchProductsPage = vi.fn();
const mockSearchCategoriesPage = vi.fn();
vi.mock('../../../lib/firestore-products', () => ({
  searchProductsPage: (...args: unknown[]) => mockSearchProductsPage(...args),
  searchCategoriesPage: (...args: unknown[]) => mockSearchCategoriesPage(...args),
}));

const mockGetPopularSearches = vi.fn();
vi.mock('../../../lib/firestore-settings', () => ({
  getPopularSearches: (...args: unknown[]) => mockGetPopularSearches(...args),
}));

vi.mock('../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { GET } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../lib/rate-limit';
import { NextRequest } from 'next/server';

function makeRequest(query: string): NextRequest {
  return new NextRequest(`https://example.com/api/search-suggestions?q=${encodeURIComponent(query)}`);
}

describe('GET /api/search-suggestions', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockSearchCategoriesPage.mockResolvedValue([]);
    mockGetPopularSearches.mockResolvedValue([]);
  });

  it('[BE-23] returns popular searches for a blank query, without querying products/categories', async () => {
    mockGetPopularSearches.mockResolvedValueOnce(['birthday frame', 'wedding gift']);
    const response = await GET(makeRequest(''));
    const body = await response.json();
    expect(body).toEqual({ products: [], categories: [], popularSearches: ['birthday frame', 'wedding gift'] });
    expect(mockSearchProductsPage).not.toHaveBeenCalled();
    expect(mockSearchCategoriesPage).not.toHaveBeenCalled();
  });

  it('returns up to 6 matching products', async () => {
    mockSearchProductsPage.mockResolvedValueOnce({
      products: [
        { id: 'p1', title: 'Frame A', slug: 'frame-a' },
        { id: 'p2', title: 'Frame B', slug: 'frame-b' },
      ],
    });
    const response = await GET(makeRequest('frame'));
    const body = await response.json();
    expect(body.products).toEqual([
      { id: 'p1', title: 'Frame A', slug: 'frame-a' },
      { id: 'p2', title: 'Frame B', slug: 'frame-b' },
    ]);
  });

  it('[BE-23] returns up to 3 matching categories alongside products', async () => {
    mockSearchProductsPage.mockResolvedValueOnce({ products: [] });
    mockSearchCategoriesPage.mockResolvedValueOnce([
      { id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames' },
      { id: 'c2', name: 'Metal Frames', slug: 'metal-frames' },
    ]);
    const response = await GET(makeRequest('frame'));
    const body = await response.json();
    expect(body.categories).toEqual([
      { id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames' },
      { id: 'c2', name: 'Metal Frames', slug: 'metal-frames' },
    ]);
  });

  it('[FE-31] includes each category thumbnail image when present', async () => {
    mockSearchProductsPage.mockResolvedValueOnce({ products: [] });
    mockSearchCategoriesPage.mockResolvedValueOnce([
      { id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames', image: '/categories/wooden.jpg' },
    ]);
    const response = await GET(makeRequest('frame'));
    const body = await response.json();
    expect(body.categories).toEqual([
      { id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames', image: '/categories/wooden.jpg' },
    ]);
  });

  it('returns 429 and does not query Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest('frame'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockSearchProductsPage).not.toHaveBeenCalled();
  });
});
