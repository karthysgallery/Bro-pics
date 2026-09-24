import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })),
    })),
  }),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { PATCH } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/reviews/review_1', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id = 'review_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/staff/reviews/[id]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'approved' }) });
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await PATCH(makeRequest({ featured: true }), makeContext());
    expect(response.status).toBe(403);
  });

  it('returns 400 when featured is not a boolean', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ featured: 'yes' }), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid placement', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ placement: 'sidebar' }), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 400 when nothing is given to update', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({}), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the review does not exist', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ featured: true }), makeContext());
    expect(response.status).toBe(404);
  });

  it('returns 400 when the review is not approved', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await PATCH(makeRequest({ featured: true }), makeContext());
    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sets featured and placement together', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ featured: true, placement: 'homepage' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ featured: true, placement: 'homepage' });
  });

  it('accepts null placement to clear it', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ placement: null }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ placement: null });
  });

  it('writes an audit log entry with the changed field names', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await PATCH(makeRequest({ featured: false }), makeContext());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'review.update', resourceId: 'review_1', details: { changedFields: ['featured'] } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ featured: true }), makeContext());
    expect(response.status).toBe(429);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
