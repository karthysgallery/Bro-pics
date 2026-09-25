import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockCollectionGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ get: mockGet, set: mockSet })),
    get: mockCollectionGet,
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { key: 'order.paid', subject: 'Order {{orderNo}} confirmed', body: 'Thanks for your order.', variables: ['orderNo'] };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/notification-templates', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/notification-templates', { headers: { Authorization: authHeader } });
}

describe('POST /api/admin/notification-templates', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ exists: false });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the key already exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: true });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('creates the template with updatedBy set to the caller', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ key: 'order.paid', updatedBy: 'admin_1' }));
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'notification_template.create', resourceId: 'order.paid' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/notification-templates', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockCollectionGet.mockResolvedValue({ docs: [{ data: () => ({ key: 'order.paid' }) }] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(403);
  });

  it('returns the template list', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body.templates).toEqual([{ key: 'order.paid' }]);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
