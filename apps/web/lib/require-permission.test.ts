import { describe, it, expect, vi } from 'vitest';
import { getPermissionContext, requirePermission } from './require-permission';

const mockVerifyIdToken = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
vi.mock('./firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(authHeader?: string): Request {
  return new Request('https://example.com', { headers: authHeader ? { Authorization: authHeader } : {} });
}

describe('getPermissionContext', () => {
  it('reports unauthenticated when there is no Authorization header', async () => {
    expect(await getPermissionContext(makeRequest())).toEqual({ authenticated: false });
  });

  it('reports unauthenticated when the header does not start with "Bearer "', async () => {
    expect(await getPermissionContext(makeRequest('Basic xyz'))).toEqual({ authenticated: false });
  });

  it('returns {uid, role} when the token verifies and carries a known role', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1', role: 'catalogue_manager' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toEqual({
      authenticated: true,
      uid: 'user_1',
      role: 'catalogue_manager',
    });
  });

  it('returns {uid, role: null} when the token verifies but has no role claim', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toEqual({
      authenticated: true,
      uid: 'user_1',
      role: null,
    });
  });

  it('returns {uid, role: null} when the token verifies but the role claim is unknown', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1', role: 'owner' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toEqual({
      authenticated: true,
      uid: 'user_1',
      role: null,
    });
  });

  it('reports unauthenticated when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    expect(await getPermissionContext(makeRequest('Bearer bad-token'))).toEqual({ authenticated: false });
  });
});

describe('requirePermission', () => {
  it('returns {ok: true, uid} when the role has the requested permission', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cat_1', role: 'catalogue_manager' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'catalogue:write')).toEqual({
      ok: true,
      uid: 'cat_1',
    });
  });

  it('returns 403 when the role does not have the requested permission', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cat_1', role: 'catalogue_manager' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'settings:write')).toEqual({
      ok: false,
      status: 403,
    });
  });

  it('returns 403 when the token verifies but carries no role (a plain customer)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cust_1' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'catalogue:read')).toEqual({
      ok: false,
      status: 403,
    });
  });

  it('returns 401 when there is no valid identity at all', async () => {
    expect(await requirePermission(makeRequest(), 'catalogue:read')).toEqual({ ok: false, status: 401 });
  });

  it('returns 401 when the token fails verification', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    expect(await requirePermission(makeRequest('Bearer bad-token'), 'catalogue:read')).toEqual({
      ok: false,
      status: 401,
    });
  });

  it('[ABE-01] grants super_admin every permission, including team:manage', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'super_1', role: 'super_admin' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'team:manage')).toEqual({
      ok: true,
      uid: 'super_1',
    });
  });

  it('denies admin team:manage specifically', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'admin_1', role: 'admin' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'team:manage')).toEqual({
      ok: false,
      status: 403,
    });
  });
});
