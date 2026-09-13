import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getAdminUserIdFromAuthHeader: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    setCustomUserClaims: mockSetCustomUserClaims,
    revokeRefreshTokens: mockRevokeRefreshTokens,
  })),
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/users/user_9/role', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(uid: string) {
  return { params: Promise.resolve({ uid }) };
}

describe('POST /api/admin/users/[uid]/role', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(403);
  });

  it('returns 400 for an invalid role value', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'superadmin' }), makeParams('user_9'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('sets the role claim on the target account', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', { role: 'staff' });
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: 'staff' });
  });

  it('clears the role claim when role is null', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: null }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', {});
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: null });
  });

  it('revokes the target account refresh tokens after a successful role change', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user_9');
  });

  it('returns 400 when an admin tries to demote themselves and does not call setCustomUserClaims', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('admin_1'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('returns 400 when an admin tries to clear their own role and does not call setCustomUserClaims', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: null }), makeParams('admin_1'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('allows an admin to re-affirm their own admin role', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'admin' }), makeParams('admin_1'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('admin_1', { role: 'admin' });
  });

  it('allows changing a different uid to staff/null even though the caller is an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', { role: 'staff' });
  });

  it('returns 429 and does not touch Firebase Auth when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});
