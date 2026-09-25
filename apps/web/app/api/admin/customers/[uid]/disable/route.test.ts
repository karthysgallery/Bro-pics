import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockUserGet = vi.fn();
const mockUserUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockUserGet, update: mockUserUpdate })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));

const mockUpdateUser = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ updateUser: mockUpdateUser, revokeRefreshTokens: mockRevokeRefreshTokens }),
}));

vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/customers/user_1/disable', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(uid = 'user_1') {
  return { params: Promise.resolve({ uid }) };
}

describe('POST /api/admin/customers/[uid]/disable', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockUserGet.mockResolvedValue({ exists: true });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(401);
  });

  it('rejects disabling your own account', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'user_1' });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: true, notAField: 1 }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the customer does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockUserGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(404);
  });

  it('disables the account and revokes refresh tokens', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('user_1', { disabled: true });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user_1');
    expect(mockUserUpdate).toHaveBeenCalledWith({ disabled: true });
  });

  it('re-enables the account without revoking tokens', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: false }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('user_1', { disabled: false });
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('writes an audit log entry distinguishing disable vs enable', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ disabled: true }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'customer.disable', resourceId: 'user_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
