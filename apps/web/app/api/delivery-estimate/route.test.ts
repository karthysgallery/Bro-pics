import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { GET } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../lib/rate-limit';
import { NextRequest } from 'next/server';

function makeRequest(pincode: string): NextRequest {
  return new NextRequest(`https://example.com/api/delivery-estimate?pincode=${encodeURIComponent(pincode)}`);
}

describe('GET /api/delivery-estimate', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns a metro estimate for a known metro pincode', async () => {
    const response = await GET(makeRequest('110001'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ serviceable: true, zone: 'metro', estimatedDaysMin: 2, estimatedDaysMax: 4 });
  });

  it('returns a standard estimate for a non-metro, non-remote pincode', async () => {
    const response = await GET(makeRequest('302001'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ serviceable: true, zone: 'standard', estimatedDaysMin: 4, estimatedDaysMax: 7 });
  });

  it('returns a remote estimate for a known remote pincode', async () => {
    const response = await GET(makeRequest('744101'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ serviceable: true, zone: 'remote', estimatedDaysMin: 7, estimatedDaysMax: 12 });
  });

  it('returns 400 for an invalid pincode', async () => {
    const response = await GET(makeRequest('900001'));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.serviceable).toBe(false);
  });

  it('returns 400 when pincode is missing', async () => {
    const response = await GET(makeRequest(''));
    expect(response.status).toBe(400);
  });

  it('returns 429 and skips computation when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await GET(makeRequest('110001'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('5');
  });
});
