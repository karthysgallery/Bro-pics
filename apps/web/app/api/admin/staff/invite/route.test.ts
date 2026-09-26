import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: mockDocSet })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/staff/invite', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/staff/invite', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'staff' }));
    expect(response.status).toBe(401);
  });

  it('returns 403 when the caller lacks team:manage', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'staff' }));
    expect(response.status).toBe(403);
  });

  it('rejects an invalid email address', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ email: 'not-an-email', role: 'staff' }));
    expect(response.status).toBe(400);
  });

  it('rejects an invalid role', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'superuser' }));
    expect(response.status).toBe(400);
  });

  it('rejects unknown fields via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'staff', extra: 1 }));
    expect(response.status).toBe(400);
  });

  it('creates an invite doc and returns 201 with the token', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'staff' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBeDefined();
    expect(body.email).toBe('priya@example.com');
    expect(body.role).toBe('staff');
    expect(body.expiresAt).toBeDefined();
    expect(mockDocSet).toHaveBeenCalledOnce();
  });

  it('writes an audit log entry for the invite', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ email: 'priya@example.com', role: 'staff' }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'admin_1',
        action: 'staff.invite',
        resource: 'staff_invite',
        details: expect.objectContaining({ email: 'priya@example.com', role: 'staff' }),
      })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ email: 'priya@example.com', role: 'staff' }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
