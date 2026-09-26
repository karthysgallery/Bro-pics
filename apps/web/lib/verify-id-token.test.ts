import { describe, it, expect, vi } from 'vitest';
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from './verify-id-token';

const mockVerifyIdToken = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
vi.mock('./firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

describe('getUserIdFromAuthHeader', () => {
  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://example.com', { headers: {} });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns null when the header does not start with "Bearer "', async () => {
    const request = new Request('https://example.com', { headers: { Authorization: 'Basic xyz' } });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns the uid when the token verifies', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getUserIdFromAuthHeader(request)).toBe('user_1');
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer bad-token' } });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });
});

describe('getStaffUserIdFromAuthHeader', () => {
  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://example.com', { headers: {} });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns the uid when the token verifies and role is admin', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_1', role: 'admin' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBe('staff_1');
  });

  it('returns the uid when the token verifies and role is staff', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_2', role: 'staff' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBe('staff_2');
  });

  it('[ABE-01] returns the uid when the token verifies and role is super_admin', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_3', role: 'super_admin' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBe('staff_3');
  });

  it('returns null when the token verifies but role is neither admin, staff, nor super_admin', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'customer_1' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });

  it('[ABE-01] returns null for a content_manager or catalogue_manager role — they are not staff', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cm_1', role: 'content_manager' });
    const request1 = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request1)).toBeNull();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'cat_1', role: 'catalogue_manager' });
    const request2 = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request2)).toBeNull();
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer bad-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });
});
