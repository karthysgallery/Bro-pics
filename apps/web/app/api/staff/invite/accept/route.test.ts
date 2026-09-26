import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// getUserIdFromAuthHeader — plain auth check (any signed-in account)
const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../admin/audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

// We need to mock the actual import path the route uses
vi.mock('../../../../../lib/audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

// Auth mock: getAuth().setCustomUserClaims / revokeRefreshTokens / getUser
const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
const mockGetUser = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    setCustomUserClaims: mockSetCustomUserClaims,
    revokeRefreshTokens: mockRevokeRefreshTokens,
    getUser: mockGetUser,
  }),
}));

// Firestore mock — invite doc + staff mirror doc
const mockInviteGet = vi.fn();
const mockInviteUpdate = vi.fn().mockResolvedValue(undefined);
const mockInviteRef = { get: mockInviteGet, update: mockInviteUpdate };
const mockStaffSet = vi.fn().mockResolvedValue(undefined);
const mockStaffRef = { set: mockStaffSet };

const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn(() => (name === 'staffInvites' ? mockInviteRef : mockStaffRef)),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const FUTURE_EXPIRY = { toDate: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
const PAST_EXPIRY = { toDate: () => new Date(Date.now() - 1000) };

function makeValidInviteSnap(overrides: Partial<{
  status: string;
  expiresAt: { toDate: () => Date };
  email: string;
  role: string;
  invitedBy: string;
}> = {}) {
  return {
    exists: true,
    data: () => ({
      email: 'priya@example.com',
      role: 'staff',
      status: 'pending',
      invitedBy: 'admin_1',
      expiresAt: FUTURE_EXPIRY,
      ...overrides,
    }),
  };
}

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/invite/accept', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/invite/accept', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ email: 'priya@example.com' });
    mockInviteGet.mockResolvedValue(makeValidInviteSnap());
  });

  it('returns 401 when the caller is not signed in', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ token: 'abc123' }));
    expect(response.status).toBe(401);
  });

  it('rejects a missing token field', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown token', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockInviteGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ token: 'bad-token' }));
    expect(response.status).toBe(404);
  });

  it('returns 409 for an already-accepted invite', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockInviteGet.mockResolvedValueOnce(makeValidInviteSnap({ status: 'accepted' }));
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(409);
  });

  it('returns 409 for a revoked invite', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockInviteGet.mockResolvedValueOnce(makeValidInviteSnap({ status: 'revoked' }));
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(409);
  });

  it('returns 410 and marks expired for a past-expiry invite', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockInviteGet.mockResolvedValueOnce(makeValidInviteSnap({ expiresAt: PAST_EXPIRY }));
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(410);
    expect(mockInviteUpdate).toHaveBeenCalledWith({ status: 'expired' });
  });

  it('returns 403 when the caller email does not match the invite email', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGetUser.mockResolvedValueOnce({ email: 'other@example.com' });
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(403);
  });

  it('succeeds for a phone-only account (no email to match)', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    // phone-only account: email is undefined
    mockGetUser.mockResolvedValueOnce({ email: undefined });
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_1', { role: 'staff' });
  });

  it('sets the custom claim + revokes refresh tokens on success', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_1', { role: 'staff' });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user_1');
  });

  it('writes the staff mirror doc on success', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    await POST(makeRequest({ token: 'tok_1' }));
    expect(mockStaffSet).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user_1', role: 'staff', active: true }));
  });

  it('marks the invite accepted on success', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    await POST(makeRequest({ token: 'tok_1' }));
    expect(mockInviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', acceptedBy: 'user_1' })
    );
  });

  it('writes an audit log entry on success', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    await POST(makeRequest({ token: 'tok_1' }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'user_1', action: 'staff.invite_accept' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ token: 'tok_1' }));
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
