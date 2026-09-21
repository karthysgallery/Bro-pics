import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })) })) })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/notifications/notif_1/read', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

describe('POST /api/notifications/[id]/read', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'notif_1' }) });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown notification (scoped to the caller\'s own subcollection)', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'notif_1' }) });
    expect(response.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('marks a notification as read', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce({ exists: true });
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'notif_1' }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ isRead: true });
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 4 });
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'notif_1' }) });
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});
