import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, DELETE } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/homepage-sections/sec_1/preview-token', {
    method: 'POST',
    headers: { Authorization: authHeader },
  });
}

function makeParams(id = 'sec_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/homepage-sections/[id]/preview-token', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the section does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('issues a random 48-hex-char token and stores it on the section', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.previewToken).toMatch(/^[0-9a-f]{48}$/);
    expect(mockUpdate).toHaveBeenCalledWith({ previewToken: body.previewToken });
  });

  it('issues a different token on each call (rotation)', async () => {
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'admin_1' });
    const first = await (await POST(makeRequest(), makeParams())).json();
    const second = await (await POST(makeRequest(), makeParams())).json();
    expect(first.previewToken).not.toBe(second.previewToken);
  });

  it('writes an audit log entry on issue', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'homepage_section.preview_token_issued', resourceId: 'sec_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/homepage-sections/[id]/preview-token', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: true });
  });

  it('returns 404 when the section does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('clears the preview token and returns 204', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith({ previewToken: null });
  });

  it('writes an audit log entry on revoke', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await DELETE(makeRequest(), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'homepage_section.preview_token_revoked', resourceId: 'sec_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
