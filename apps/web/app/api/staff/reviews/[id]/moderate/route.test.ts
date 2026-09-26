import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetStaffUserId(...args),
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

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { POST } from './route';
import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

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
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(403);
  });

  it('returns 400 on an invalid action', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ action: 'delete' }), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the review does not exist', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(404);
  });

  it('returns 409 when the review is not pending', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'approved' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(409);
  });

  it('approves a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'approved' });
  });

  it('rejects a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'reject' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'rejected' });
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('[ABE-22] returns 400 when note is not a string', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ action: 'approve', note: 42 }), makeContext());
    expect(response.status).toBe(400);
  });

  it('[ABE-22] persists moderationNote alongside the status update', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'reject', note: 'Off-topic content' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'rejected', moderationNote: 'Off-topic content' });
  });

  it('[ABE-03] writes an audit log entry on a successful moderation', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'staff_1',
        action: 'review.moderate',
        resource: 'review',
        resourceId: 'review_1',
        details: { fromStatus: 'pending', toStatus: 'approved' },
      })
    );
  });
});
