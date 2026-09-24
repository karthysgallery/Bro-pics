import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockTokenQueryGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: mockTokenQueryGet })) })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';
import { NextRequest } from 'next/server';

function makeRequest(token?: string): NextRequest {
  const url = token ? `https://example.com/api/homepage-sections/preview?token=${token}` : 'https://example.com/api/homepage-sections/preview';
  return new NextRequest(url);
}

describe('GET /api/homepage-sections/preview', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 400 when no token is given', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown token', async () => {
    mockTokenQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const response = await GET(makeRequest('deadbeef'));
    expect(response.status).toBe(404);
  });

  it('returns the section for a matching token, bypassing isActive', async () => {
    const section = { id: 'sec_1', isActive: false, previewToken: 'abc123' };
    mockTokenQueryGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => section }] });
    const response = await GET(makeRequest('abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.section).toEqual(section);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeRequest('abc123'));
    expect(response.status).toBe(429);
    expect(mockTokenQueryGet).not.toHaveBeenCalled();
  });
});
