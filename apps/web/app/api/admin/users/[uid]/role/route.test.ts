import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    setCustomUserClaims: mockSetCustomUserClaims,
    revokeRefreshTokens: mockRevokeRefreshTokens,
  })),
}));

const mockStaffGet = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
const mockStaffSet = vi.fn().mockResolvedValue(undefined);
const mockStaffUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockStaffGet, set: mockStaffSet, update: mockStaffUpdate })),
    })),
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
    mockGetAdminUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(403);
  });

  it('returns 400 for an invalid role value', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'superadmin' }), makeParams('user_9'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('sets the role claim on the target account', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', { role: 'staff' });
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: 'staff' });
  });

  it('clears the role claim when role is null', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: null }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', {});
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: null });
  });

  it('revokes the target account refresh tokens after a successful role change', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user_9');
  });

  it('returns 400 when an admin tries to demote themselves and does not call setCustomUserClaims', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('admin_1'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('returns 400 when an admin tries to clear their own role and does not call setCustomUserClaims', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: null }), makeParams('admin_1'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('allows an admin to re-affirm their own admin role', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'admin' }), makeParams('admin_1'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('admin_1', { role: 'admin' });
  });

  it('allows changing a different uid to staff/null even though the caller is an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', { role: 'staff' });
  });

  it('[ABE-01] accepts every one of the five roles', async () => {
    for (const role of ['super_admin', 'admin', 'staff', 'content_manager', 'catalogue_manager']) {
      mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
      const response = await POST(makeRequest({ role }), makeParams('user_9'));
      expect(response.status).toBe(200);
    }
  });

  it('[ABE-01] writes the staff/{uid} mirror doc when granting a role', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ role: 'catalogue_manager' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockStaffSet).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user_9', role: 'catalogue_manager', active: true, invitedBy: 'admin_1', lastLoginAt: null })
    );
  });

  it('[ABE-01] preserves an existing lastLoginAt when re-granting a role', async () => {
    const existingTimestamp = { toDate: () => new Date('2026-09-01T00:00:00.000Z') };
    mockStaffGet.mockResolvedValueOnce({ exists: true, data: () => ({ lastLoginAt: existingTimestamp }) });
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(mockStaffSet).toHaveBeenCalledWith(expect.objectContaining({ lastLoginAt: new Date('2026-09-01T00:00:00.000Z') }));
  });

  it('[ABE-01] marks the mirror inactive (not deleted) when clearing an existing role', async () => {
    mockStaffGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ role: null }), makeParams('user_9'));
    expect(mockStaffUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(mockStaffSet).not.toHaveBeenCalled();
  });

  it('[ABE-01] does nothing to Firestore when clearing a role that never had a mirror doc', async () => {
    mockStaffGet.mockResolvedValueOnce({ exists: false });
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ role: null }), makeParams('user_9'));
    expect(mockStaffUpdate).not.toHaveBeenCalled();
    expect(mockStaffSet).not.toHaveBeenCalled();
  });

  it('[ABE-01] allows a super_admin to demote themselves to admin, but not to staff or null', async () => {
    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const toAdmin = await POST(makeRequest({ role: 'admin' }), makeParams('admin_1'));
    expect(toAdmin.status).toBe(200);

    mockGetAdminUserId.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const toStaff = await POST(makeRequest({ role: 'staff' }), makeParams('admin_1'));
    expect(toStaff.status).toBe(400);
  });

  it('returns 429 and does not touch Firebase Auth when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});
