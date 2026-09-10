import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchProductsPage = vi.fn();
vi.mock('../../../lib/firestore-products', () => ({
  searchProductsPage: (...args: unknown[]) => mockSearchProductsPage(...args),
}));

vi.mock('../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { GET } from './route';
import { checkRateLimit } from '../../../lib/rate-limit';
import { NextRequest } from 'next/server';

function makeRequest(query: string): NextRequest {
  return new NextRequest(`https://example.com/api/search-suggestions?q=${encodeURIComponent(query)}`);
}

describe('GET /api/search-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty list when the query is blank', async () => {
    const response = await GET(makeRequest(''));
    const body = await response.json();
    expect(body).toEqual({ products: [] });
    expect(mockSearchProductsPage).not.toHaveBeenCalled();
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
    expect(body).toEqual({
      products: [
        { id: 'p1', title: 'Frame A', slug: 'frame-a' },
        { id: 'p2', title: 'Frame B', slug: 'frame-b' },
      ],
    });
  });

  it('returns 429 and does not query Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await GET(makeRequest('frame'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockSearchProductsPage).not.toHaveBeenCalled();
  });
});
