import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrder = vi.fn();
vi.mock('../../../../../../lib/order-lookup', () => ({ findOrderByOrderNo: (...args: unknown[]) => mockFindOrder(...args) }));

const mockWriteNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/notify', () => ({ writeNotification: (...args: unknown[]) => mockWriteNotification(...args) }));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindIdempotentResponse = vi.fn().mockResolvedValue(null);
const mockRecordIdempotentResponse = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/admin-idempotency', () => ({
  getIdempotencyKeyHeader: (request: Request) => {
    const value = request.headers.get('Idempotency-Key');
    return value && value.trim().length > 0 ? value.trim() : null;
  },
  findIdempotentResponse: (...args: unknown[]) => mockFindIdempotentResponse(...args),
  recordIdempotentResponse: (...args: unknown[]) => mockRecordIdempotentResponse(...args),
}));

const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id?: string) => ({
      id: id ?? 'generated_id',
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'event_1' })) })),
    })),
  })),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token', idempotencyKey?: string): Request {
  return new Request('https://example.com/api/staff/orders/BP-2026-00001/advance', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/orders/[orderNo]/advance', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, set: mockTransactionSet, update: mockTransactionUpdate })
    );
  });

  function mockOrderSnap(status: string): void {
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status }) });
  }

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 when no order matches the order number', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-99999' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 when advancing to shipped without courier/awbNumber', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'printed_packed' } });
    const response = await POST(makeRequest({ status: 'shipped' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status transition', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'pending_payment' } });
    const response = await POST(makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123' }), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('advances a valid transition, writes an event, and updates the order', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('in_production');

    const response = await POST(
      makeRequest({ status: 'printed_packed', note: 'Ready for pickup' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'printed_packed', note: 'Ready for pickup', createdBy: 'staff_1' })
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'printed_packed' })
    );
  });

  it('writes a notification to the order\'s owner on a status change', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', userId: 'user_1', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('printed_packed');

    await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(mockWriteNotification).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'shipping',
      'Order shipped',
      expect.stringContaining('BP-2026-00001'),
      '/orders/order_1'
    );
  });

  it('sets courier/awbNumber on the order when advancing to shipped', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('printed_packed');

    const response = await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' })
    );
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' })
    );

    const body = await response.json();
    expect(body.order.courier).toBe('BlueDart');
    expect(body.order.awbNumber).toBe('BD123456789');
  });

  it('[BE-20] sets shipmentTracking with status shipped and a null trackingUrl (no courier API integrated)', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('printed_packed');

    const response = await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        shipmentTracking: expect.objectContaining({
          provider: 'BlueDart',
          awbNumber: 'BD123456789',
          trackingUrl: null,
          status: 'shipped',
          deliveredAt: null,
        }),
      })
    );
  });

  it('[BE-20] merges into the existing shipmentTracking on delivered, preserving provider/awbNumber/shippedAt', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'shipped', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockTransactionGet.mockResolvedValueOnce({
      data: () => ({
        status: 'shipped',
        shipmentTracking: {
          provider: 'BlueDart',
          awbNumber: 'BD123456789',
          trackingUrl: null,
          status: 'shipped',
          shippedAt: '2026-09-10T00:00:00.000Z',
          deliveredAt: null,
        },
      }),
    });

    const response = await POST(makeRequest({ status: 'delivered' }), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        shipmentTracking: expect.objectContaining({
          provider: 'BlueDart',
          awbNumber: 'BD123456789',
          shippedAt: '2026-09-10T00:00:00.000Z',
          status: 'delivered',
          deliveredAt: expect.any(String),
        }),
      })
    );
  });

  it('[BE-20] does not fabricate shipmentTracking on delivered when no prior shipmentTracking exists', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'shipped', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status: 'shipped' }) });

    const response = await POST(makeRequest({ status: 'delivered' }), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });

    expect(response.status).toBe(200);
    const updateCall = mockTransactionUpdate.mock.calls.find((call) => (call[1] as Record<string, unknown>).status === 'delivered');
    expect(updateCall?.[1]).not.toHaveProperty('shipmentTracking');
  });

  it('nulls courier/awbNumber on the written event for a non-shipped transition even if the body includes them', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('in_production');

    const response = await POST(
      makeRequest({ status: 'printed_packed', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'printed_packed', courier: null, awbNumber: null })
    );
  });

  it('returns 409 when the in-transaction read shows the order status changed concurrently', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    // A concurrent request already moved the order to 'refunded' by the
    // time this transaction's read executes, even though the pre-transaction
    // read (via findOrderByOrderNo above) still saw 'printed_packed'.
    mockOrderSnap('refunded');

    const response = await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(409);
    expect(mockTransactionSet).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('[BE-18] queues one print job per order item when a red-tier order is manually advanced to print_rendering', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'photo_validation', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    // First get(): the order's own status re-read. Second get(): the
    // items subcollection, only fetched because status === 'print_rendering'.
    mockTransactionGet
      .mockResolvedValueOnce({ data: () => ({ status: 'photo_validation' }) })
      .mockResolvedValueOnce({
        docs: [
          { id: 'item_1', data: () => ({ personalizationId: 'p1' }) },
          { id: 'item_2', data: () => ({ personalizationId: 'p2' }) },
        ],
      });

    const response = await POST(
      makeRequest({ status: 'print_rendering' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 'order_1', itemId: 'item_1', personalizationId: 'p1', status: 'queued' })
    );
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 'order_1', itemId: 'item_2', personalizationId: 'p2', status: 'queued' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mockFindOrder).not.toHaveBeenCalled();
  });

  it('[ABE-03] writes an audit log entry on a successful advance', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('in_production');

    await POST(makeRequest({ status: 'printed_packed' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUid: 'staff_1',
        action: 'order.advance',
        resource: 'order',
        resourceId: 'order_1',
        details: { fromStatus: 'in_production', toStatus: 'printed_packed' },
      })
    );
  });

  it('[ABE-03] returns the original response and skips the transaction when a prior Idempotency-Key response exists', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindIdempotentResponse.mockResolvedValueOnce({ status: 200, body: { order: { orderNo: 'BP-2026-00001', status: 'printed_packed' } } });

    const response = await POST(makeRequest({ status: 'printed_packed' }, 'Bearer good-token', 'retry-key-1'), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ order: { orderNo: 'BP-2026-00001', status: 'printed_packed' } });
    expect(mockFindOrder).not.toHaveBeenCalled();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('[ABE-03] records the response under the Idempotency-Key after a successful advance', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('in_production');

    await POST(makeRequest({ status: 'printed_packed' }, 'Bearer good-token', 'retry-key-2'), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });

    expect(mockRecordIdempotentResponse).toHaveBeenCalledWith(
      expect.anything(),
      'staff.orders.advance',
      'retry-key-2',
      200,
      expect.objectContaining({ order: expect.objectContaining({ status: 'printed_packed' }) })
    );
  });

  it('[ABE-03] does not check or record an Idempotency-Key when the header is absent', async () => {
    mockGetStaffUserId.mockResolvedValueOnce({ ok: true, uid: 'staff_1' });
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });
    mockOrderSnap('in_production');

    await POST(makeRequest({ status: 'printed_packed' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });

    expect(mockFindIdempotentResponse).not.toHaveBeenCalled();
    expect(mockRecordIdempotentResponse).not.toHaveBeenCalled();
  });
});
