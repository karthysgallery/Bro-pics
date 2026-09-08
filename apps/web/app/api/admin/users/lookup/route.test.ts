import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getAdminUserIdFromAuthHeader: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockGetUserByPhoneNumber = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ getUserByPhoneNumber: mockGetUserByPhoneNumber })),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/users/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when phone is missing', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup'));
    expect(response.status).toBe(400);
  });

  it('returns 404 when no account has that phone number', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockRejectedValueOnce(new Error('no user'));
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(404);
  });

  it('returns the account with its current role on a match', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'user_9',
      phoneNumber: '+911234567890',
      customClaims: { role: 'staff' },
    });
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', phoneNumber: '+911234567890', role: 'staff' });
  });

  it('returns role: null when the account has no role claim yet', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'user_9',
      phoneNumber: '+911234567890',
      customClaims: undefined,
    });
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    const body = await response.json();
    expect(body.role).toBeNull();
  });
});
