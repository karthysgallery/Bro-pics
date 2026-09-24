import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockTransitionOrder = vi.fn();
vi.mock('@bro-pics/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bro-pics/shared')>();
  return { ...actual, transitionOrder: (...args: unknown[]) => mockTransitionOrder(...args) };
});

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';
import { InvalidTransitionError, OrderNotFoundError } from '@bro-pics/shared';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1/qc', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'order_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/orders/[id]/qc', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockTransitionOrder.mockResolvedValue({ orderId: 'order_1', fromStatus: 'quality_check', toStatus: 'packed' });
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ result: 'pass', notAField: 'x' }), makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects fail without a reason', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ result: 'fail' }), makeParams());
    expect(response.status).toBe(400);
    expect(mockTransitionOrder).not.toHaveBeenCalled();
  });

  it('transitions to packed on pass', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ result: 'pass' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockTransitionOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 'order_1', toStatus: 'packed', actorUid: 'staff_1' })
    );
    const body = await response.json();
    expect(body).toEqual({ id: 'order_1', result: 'pass', status: 'packed' });
  });

  it('transitions to rework on fail, with the reason as the event note', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockTransitionOrder.mockResolvedValueOnce({ orderId: 'order_1', fromStatus: 'quality_check', toStatus: 'rework' });
    const response = await POST(makeRequest({ result: 'fail', reason: 'Colour mismatch' }), makeParams());
    expect(response.status).toBe(200);
    expect(mockTransitionOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toStatus: 'rework', note: 'Colour mismatch' })
    );
  });

  it('returns 404 when the order does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockTransitionOrder.mockRejectedValueOnce(new OrderNotFoundError('nope'));
    const response = await POST(makeRequest({ result: 'pass' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 409 with the allowed targets on an invalid transition', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockTransitionOrder.mockRejectedValueOnce(new InvalidTransitionError('paid', 'packed', ['payment_confirmed', 'in_production', 'cancelled', 'refunded']));
    const response = await POST(makeRequest({ result: 'pass' }), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.details.allowed).toEqual(['payment_confirmed', 'in_production', 'cancelled', 'refunded']);
  });

  it('writes an audit log entry with the QC result', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    await POST(makeRequest({ result: 'fail', reason: 'Blurry print' }), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'staff_1', action: 'order.qc', resourceId: 'order_1', details: { result: 'fail', reason: 'Blurry print' } })
    );
  });

  it('returns 429 and does not call transitionOrder when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ result: 'pass' }), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
