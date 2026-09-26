import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const mockStaffGet = vi.fn();
const mockStaffUpdate = vi.fn().mockResolvedValue(undefined);
const mockStaffRef = { get: mockStaffGet, update: mockStaffUpdate };
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => mockStaffRef) })),
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
  return new Request('https://example.com/api/admin/staff/staff_2/disable', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(uid = 'staff_2') {
  return { params: Promise.resolve({ uid }) };
}

describe('POST /api/admin/staff/[uid]/disable', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    // by default, the staff mirror exists
    mockStaffGet.mockResolvedValue({ exists: true });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 403 when the caller lacks team:manage', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(403);
  });

  it('blocks self-disable', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_2' });
    const response = await POST(makeRequest({ disabled: true }), makeParams('staff_2'));
    expect(response.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('rejects a missing disabled field', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects a non-boolean disabled field', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: 'yes' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('disables the account and revokes refresh tokens', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('staff_2', { disabled: true });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('staff_2');
    expect(mockStaffUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });

  it('re-enables the account without revoking refresh tokens', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ disabled: false }), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('staff_2', { disabled: false });
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
    expect(mockStaffUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('skips the staff mirror update when the mirror doc does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockStaffGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(200);
    expect(mockStaffUpdate).not.toHaveBeenCalled();
  });

  it('writes an audit log distinguishing staff.disable vs staff.enable', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ disabled: true }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'staff.disable', resourceId: 'staff_2' })
    );
  });

  it('writes staff.enable in the audit log when re-enabling', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ disabled: false }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'staff.enable' })
    );
  });

  it('returns 429 and does not touch Auth when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ disabled: true }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
