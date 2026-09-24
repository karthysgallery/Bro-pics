import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockTransitionOrder = vi.fn();
vi.mock('@bro-pics/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bro-pics/shared')>();
  return { ...actual, transitionOrder: (...args: unknown[]) => mockTransitionOrder(...args) };
});

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';
import { InvalidTransitionError, OrderNotFoundError } from '@bro-pics/shared';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/bulk-transition', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/orders/bulk-transition', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ orderIds: ['order_1'], toStatus: 'paid', notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('rejects an empty orderIds array', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ orderIds: [], toStatus: 'paid' }));
    expect(response.status).toBe(400);
  });

  it('rejects an invalid toStatus', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    const response = await POST(makeRequest({ orderIds: ['order_1'], toStatus: 'not_a_status' }));
    expect(response.status).toBe(400);
  });

  it('reports per-order success and failure without failing the whole batch', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockTransitionOrder
      .mockResolvedValueOnce({ orderId: 'order_1', fromStatus: 'paid', toStatus: 'in_production' })
      .mockRejectedValueOnce(new InvalidTransitionError('delivered', 'in_production', ['refunded']))
      .mockRejectedValueOnce(new OrderNotFoundError('Unknown order id: order_3'));

    const response = await POST(makeRequest({ orderIds: ['order_1', 'order_2', 'order_3'], toStatus: 'in_production' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      { orderId: 'order_1', ok: true },
      { orderId: 'order_2', ok: false, error: 'invalid_transition', allowed: ['refunded'] },
      { orderId: 'order_3', ok: false, error: 'not_found' },
    ]);
  });

  it('writes a single audit log entry with requested/succeeded counts', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockTransitionOrder
      .mockResolvedValueOnce({ orderId: 'order_1', fromStatus: 'paid', toStatus: 'in_production' })
      .mockRejectedValueOnce(new OrderNotFoundError('nope'));

    await POST(makeRequest({ orderIds: ['order_1', 'order_2'], toStatus: 'in_production' }));

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'staff_1',
        action: 'order.bulk_transition',
        details: { toStatus: 'in_production', requested: 2, succeeded: 1 },
      })
    );
  });

  it('returns 429 and does not call transitionOrder when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ orderIds: ['order_1'], toStatus: 'paid' }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
