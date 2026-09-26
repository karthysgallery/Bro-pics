import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST, GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockCreateRazorpayRefund = vi.fn();
vi.mock('../../../../../../lib/razorpay-client', () => ({
  createRazorpayRefund: (...args: unknown[]) => mockCreateRazorpayRefund(...args),
}));

const mockFindIdempotentResponse = vi.fn().mockResolvedValue(null);
const mockRecordIdempotentResponse = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/admin-idempotency', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/admin-idempotency')>();
  return {
    ...actual,
    findIdempotentResponse: (...args: unknown[]) => mockFindIdempotentResponse(...args),
    recordIdempotentResponse: (...args: unknown[]) => mockRecordIdempotentResponse(...args),
  };
});

const mockOrderGet = vi.fn();
const mockOrderUpdate = vi.fn().mockResolvedValue(undefined);
const mockRefundDocGet = vi.fn();
const mockRefundSet = vi.fn().mockResolvedValue(undefined);
const mockRefundUpdate = vi.fn().mockResolvedValue(undefined);
const mockRefundsWhereGet = vi.fn();

const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockOrderGet,
      update: mockOrderUpdate,
      collection: vi.fn(() => ({
        doc: vi.fn((id?: string) => ({ id: id ?? 'refund_new_1', get: mockRefundDocGet, set: mockRefundSet, update: mockRefundUpdate })),
        where: vi.fn(() => ({ get: mockRefundsWhereGet })),
        get: mockRefundsWhereGet,
      })),
    })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../../lib/rate-limit';

const validOrder = { razorpayPaymentId: 'pay_1', total: 105000, status: 'delivered' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token', extraHeaders: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/admin/orders/order_1/refunds', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/orders/order_1/refunds', { headers: { Authorization: authHeader } });
}

function makeParams(id = 'order_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/orders/[id]/refunds', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockFindIdempotentResponse.mockResolvedValue(null);
    mockOrderGet.mockResolvedValue({ exists: true, data: () => validOrder });
    mockRefundsWhereGet.mockResolvedValue({ docs: [] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(401);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ notAField: 1 }), makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the order does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 when the order has no payment to refund', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...validOrder, razorpayPaymentId: undefined }) });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(400);
  });

  it('creates a full-amount refund doc before calling Razorpay, using the doc id as the idempotency key', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCreateRazorpayRefund.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });

    const response = await POST(makeRequest({}), makeParams());

    expect(response.status).toBe(200);
    expect(mockRefundSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'refund_new_1', orderId: 'order_1', amount: 105000, status: 'pending', createdBy: 'admin_1' })
    );
    expect(mockCreateRazorpayRefund).toHaveBeenCalledWith({
      paymentId: 'pay_1',
      amount: 105000,
      notes: { orderId: 'order_1', refundId: 'refund_new_1' },
      idempotencyKey: 'refund_new_1',
    });
    expect(mockRefundUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'processed', razorpayRefundId: 'rfnd_1' }));
  });

  it('rejects a partial amount exceeding the remaining refundable total', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ amount: 200000 }), makeParams());
    expect(response.status).toBe(400);
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('accounts for already-processed refunds when validating a partial amount', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockRefundsWhereGet.mockResolvedValueOnce({ docs: [{ data: () => ({ amount: 50000 }) }] });
    const response = await POST(makeRequest({ amount: 60000 }), makeParams());
    expect(response.status).toBe(400);
  });

  it('flips the order to refunded once total processed refunds reach the order total', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCreateRazorpayRefund.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });
    mockRefundsWhereGet
      .mockResolvedValueOnce({ docs: [] }) // remaining-amount check before the call
      .mockResolvedValueOnce({ docs: [{ data: () => ({ amount: 105000 }) }] }); // post-processing sum check

    await POST(makeRequest({}), makeParams());

    expect(mockOrderUpdate).toHaveBeenCalledWith({ status: 'refunded' });
  });

  it('processes an existing pending refund proposal when refundId is given, ignoring body amount', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockRefundDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'refund_proposed_1', orderId: 'order_1', amount: 105000, status: 'pending', razorpayRefundId: null }),
    });
    mockCreateRazorpayRefund.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });

    const response = await POST(makeRequest({ refundId: 'refund_proposed_1', amount: 1 }), makeParams());

    expect(response.status).toBe(200);
    expect(mockRefundSet).not.toHaveBeenCalled();
    expect(mockCreateRazorpayRefund).toHaveBeenCalledWith(expect.objectContaining({ amount: 105000 }));
  });

  it('returns 409 when the given refundId is not a pending, unprocessed proposal', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockRefundDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'refund_1', orderId: 'order_1', amount: 105000, status: 'processed', razorpayRefundId: 'rfnd_1' }),
    });
    const response = await POST(makeRequest({ refundId: 'refund_1' }), makeParams());
    expect(response.status).toBe(409);
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('returns 404 when the given refundId does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockRefundDocGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ refundId: 'refund_missing' }), makeParams());
    expect(response.status).toBe(404);
  });

  it('marks the refund doc failed and returns 502 when Razorpay throws', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCreateRazorpayRefund.mockRejectedValueOnce(new Error('Razorpay refund failed (500): boom'));

    const response = await POST(makeRequest({}), makeParams());

    expect(response.status).toBe(502);
    expect(mockRefundUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'refund.failed' }));
  });

  it('writes an audit log entry on successful processing', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockCreateRazorpayRefund.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });
    await POST(makeRequest({}), makeParams());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'refund.process', resource: 'refund', resourceId: 'refund_new_1' })
    );
  });

  it('returns the original response and skips Razorpay when a prior Idempotency-Key response exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindIdempotentResponse.mockResolvedValueOnce({ status: 200, body: { refundId: 'refund_old', status: 'processed' } });
    const response = await POST(makeRequest({}, 'Bearer good-token', { 'Idempotency-Key': 'key-1' }), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ refundId: 'refund_old', status: 'processed' });
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({}), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/orders/[id]/refunds', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRefundsWhereGet.mockResolvedValue({ docs: [{ data: () => ({ id: 'refund_1', amount: 105000, status: 'processed' }) }] });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeGetRequest(), makeParams());
    expect(response.status).toBe(403);
  });

  it('returns the refunds for the order', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeGetRequest(), makeParams());
    const body = await response.json();
    expect(body.refunds).toEqual([{ id: 'refund_1', amount: 105000, status: 'processed' }]);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await GET(makeGetRequest(), makeParams());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});
