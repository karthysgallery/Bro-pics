import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockRevokeRefreshTokens = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ revokeRefreshTokens: (...args: unknown[]) => mockRevokeRefreshTokens(...args) }),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/auth/revoke-sessions', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

describe('POST /api/auth/revoke-sessions', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRevokeRefreshTokens.mockResolvedValue(undefined);
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('revokes only the caller\'s own uid, never one from the request body', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(
      new Request('https://example.com/api/auth/revoke-sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'someone_else' }),
      })
    );
    expect(response.status).toBe(200);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user_1');
    const body = await response.json();
    expect(body.revoked).toBe(true);
  });

  it('returns 429 and does not touch Firebase Auth when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
