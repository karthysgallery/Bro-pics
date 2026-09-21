import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockFindVariantById = vi.fn();
vi.mock('../../../../../lib/variant-lookup', () => ({
  findVariantById: (...args: unknown[]) => mockFindVariantById(...args),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

describe('GET /api/variants/[variantId]/product', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 404 for an unknown variantId', async () => {
    mockFindVariantById.mockResolvedValueOnce(null);
    const response = await GET(new Request('https://example.com/api/variants/v1/product'), {
      params: Promise.resolve({ variantId: 'v1' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns the variant\'s productId, stockStatus, and isActive', async () => {
    mockFindVariantById.mockResolvedValueOnce({ productId: 'prod_1', stockStatus: 'out_of_stock', isActive: true });
    const response = await GET(new Request('https://example.com/api/variants/v1/product'), {
      params: Promise.resolve({ variantId: 'v1' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ productId: 'prod_1', stockStatus: 'out_of_stock', isActive: true });
  });

  it('returns 429 and skips the lookup when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 3 });
    const response = await GET(new Request('https://example.com/api/variants/v1/product'), {
      params: Promise.resolve({ variantId: 'v1' }),
    });
    expect(response.status).toBe(429);
    expect(mockFindVariantById).not.toHaveBeenCalled();
  });
});
