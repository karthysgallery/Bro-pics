import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })),
    })),
  }),
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

import { POST } from './route';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/reviews/review_1/moderate', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id = 'review_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/staff/reviews/[id]/moderate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(403);
  });

  it('returns 400 on an invalid action', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await POST(makeRequest({ action: 'delete' }), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the review does not exist', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(404);
  });

  it('returns 409 when the review is not pending', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'approved' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(409);
  });

  it('approves a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'approved' });
  });

  it('rejects a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'reject' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'rejected' });
  });
});
