import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getAdminUserIdFromAuthHeader: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

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
});
