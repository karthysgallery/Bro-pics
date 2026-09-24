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
  it('returns null when there is no Authorization header', async () => {
    expect(await getPermissionContext(makeRequest())).toBeNull();
  });

  it('returns null when the header does not start with "Bearer "', async () => {
    expect(await getPermissionContext(makeRequest('Basic xyz'))).toBeNull();
  });

  it('returns {uid, role} when the token verifies and carries a known role', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1', role: 'catalogue_manager' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toEqual({ uid: 'user_1', role: 'catalogue_manager' });
  });

  it('returns null when the token verifies but has no role claim', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toBeNull();
  });

  it('returns null when the token verifies but the role claim is unknown', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1', role: 'owner' });
    expect(await getPermissionContext(makeRequest('Bearer good-token'))).toBeNull();
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    expect(await getPermissionContext(makeRequest('Bearer bad-token'))).toBeNull();
  });
});

describe('requirePermission', () => {
  it('returns the uid when the role has the requested permission', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cat_1', role: 'catalogue_manager' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'catalogue:write')).toBe('cat_1');
  });

  it('returns null when the role does not have the requested permission', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cat_1', role: 'catalogue_manager' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'settings:write')).toBeNull();
  });

  it('returns null when there is no valid identity at all', async () => {
    expect(await requirePermission(makeRequest(), 'catalogue:read')).toBeNull();
  });

  it('[ABE-01] grants super_admin every permission, including team:manage', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'super_1', role: 'super_admin' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'team:manage')).toBe('super_1');
  });

  it('denies admin team:manage specifically', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'admin_1', role: 'admin' });
    expect(await requirePermission(makeRequest('Bearer good-token'), 'team:manage')).toBeNull();
  });
});
