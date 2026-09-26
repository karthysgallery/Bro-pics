import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockOrderGet = vi.fn();
const mockOrderUpdate = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockOrderGet, update: mockOrderUpdate })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

const existingTracking = {
  provider: 'BlueDart',
  awbNumber: 'BD123456',
  trackingUrl: null,
  status: 'shipped',
  shippedAt: '2026-09-01T00:00:00.000Z',
  deliveredAt: null,
};

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1/shipping', {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'order_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/orders/[id]/shipping', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockOrderGet.mockResolvedValue({ exists: true, data: () => ({ shipmentTracking: existingTracking }) });
  });

  it('returns 404 when the order does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 when the order has no shipmentTracking yet', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    const response = await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it('rejects an invalid URL', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ trackingUrl: 'not-a-url' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456', notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('sets trackingUrl while preserving the rest of shipmentTracking', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      shipmentTracking: { ...existingTracking, trackingUrl: 'https://track.example.com/BD123456' },
    });
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456' }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'order.shipping_update', resourceId: 'order_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await PATCH(makeRequest({ trackingUrl: 'https://track.example.com/BD123456' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
