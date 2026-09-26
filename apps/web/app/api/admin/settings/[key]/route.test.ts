import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet, set: mockSet })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeGetRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/settings/shipping', { headers: { Authorization: authHeader } });
}

function makePutRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/settings/shipping', {
    method: 'PUT',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(key = 'shipping') {
  return { params: Promise.resolve({ key }) };
}

const validShippingBody = { freeShippingThreshold: 150000, flatShippingCharge: 5000, expressShippingCharge: 15000 };

describe('GET /api/admin/settings/[key]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await GET(makeGetRequest(), makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown settings key', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeGetRequest(), makeParams('bogus'));
    expect(response.status).toBe(404);
  });

  it('returns null value when the doc has never been configured', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await GET(makeGetRequest(), makeParams());
    const body = await response.json();
    expect(body).toEqual({ key: 'shipping', value: null });
  });

  it('returns the stored value when the doc exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => validShippingBody });
    const response = await GET(makeGetRequest(), makeParams());
    const body = await response.json();
    expect(body).toEqual({ key: 'shipping', value: validShippingBody });
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/settings/[key]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await PUT(makePutRequest(validShippingBody), makeParams());
    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown settings key', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PUT(makePutRequest({}), makeParams('bogus'));
    expect(response.status).toBe(404);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects an invalid body for the given key', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PUT(makePutRequest({ notAField: 1 }), makeParams());
    expect(response.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('sets the settings/{key} doc on a valid body', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PUT(makePutRequest(validShippingBody), makeParams());
    expect(response.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(validShippingBody);
    const body = await response.json();
    expect(body).toEqual({ key: 'shipping', value: validShippingBody });
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await PUT(makePutRequest(validShippingBody), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'settings.update', resource: 'settings', resourceId: 'shipping' })
    );
  });

  it('validates a different key against its own schema (notifications)', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await PUT(
      makePutRequest({ emailEnabled: true, smsEnabled: false, whatsappEnabled: false }),
      makeParams('notifications')
    );
    expect(response.status).toBe(200);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PUT(makePutRequest(validShippingBody), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
