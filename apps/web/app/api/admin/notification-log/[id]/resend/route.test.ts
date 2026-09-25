import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })) })),
};
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
  FieldValue: { delete: () => 'FIELD_DELETE' },
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/notification-log/entry_1/resend', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

function makeParams(id = 'entry_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/notification-log/[id]/resend', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'failed' }) });
  });

  it('returns 404 when the entry does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 409 when the entry is already queued', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'queued' }) });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('resets a failed entry back to queued', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', attempts: 0, nextAttemptAt: 'FIELD_DELETE', lastError: 'FIELD_DELETE' })
    );
  });

  it('writes an audit log entry with the prior status', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'notification_log.resend', resourceId: 'entry_1', details: { fromStatus: 'failed' } })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
