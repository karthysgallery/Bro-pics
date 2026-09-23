import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockCreateRazorpayRefund = vi.fn();
vi.mock('../../../../../lib/razorpay-client', () => ({
  createRazorpayRefund: (...args: unknown[]) => mockCreateRazorpayRefund(...args),
}));

const mockWriteNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/notify', () => ({ writeNotification: (...args: unknown[]) => mockWriteNotification(...args) }));

const mockReturnGet = vi.fn();
const mockOrderGet = vi.fn();
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockTransactionSet = vi.fn();
const mockRunTransaction = vi.fn();

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'returns') {
      return {
        doc: vi.fn(() => ({
          get: mockReturnGet,
          collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'return_event_1' })) })),
        })),
      };
    }
    if (name === 'orders') {
      return {
        doc: vi.fn(() => ({
          get: mockOrderGet,
          collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'event_1' })) })),
        })),
      };
    }
    return {};
  }),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/returns/ret_1', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/returns/[returnId]', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, update: mockTransactionUpdate, set: mockTransactionSet })
    );
  });

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'approved' }), { params: Promise.resolve({ returnId: 'ret_1' }) });
    expect(response.status).toBe(403);
  });

  it('returns 400 for a missing/invalid status', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await POST(makeRequest({}), { params: Promise.resolve({ returnId: 'ret_1' }) });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown returnId', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ status: 'approved' }), { params: Promise.resolve({ returnId: 'ret_1' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid transition', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'requested', orderId: 'order_1', refundAmount: 1000 }) });
    const response = await POST(makeRequest({ status: 'refunded' }), { params: Promise.resolve({ returnId: 'ret_1' }) });
    expect(response.status).toBe(400);
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('approves a requested return without touching Razorpay', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'requested', orderId: 'order_1', userId: 'user_1', refundAmount: 1000 }),
    });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status: 'requested' }) });

    const response = await POST(makeRequest({ status: 'approved' }), { params: Promise.resolve({ returnId: 'ret_1' }) });

    expect(response.status).toBe(200);
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'approved' }));
    expect(mockWriteNotification).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'refund',
      'Return approved',
      expect.stringContaining('BP-2026-00001'),
      '/orders/order_1'
    );
  });

  it('calls Razorpay and moves the order to refunded when advancing to refunded', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'refund_processing', orderId: 'order_1', userId: 'user_1', refundAmount: 105000 }),
    });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ razorpayPaymentId: 'pay_1', orderNo: 'BP-2026-00001' }) });
    mockCreateRazorpayRefund.mockResolvedValueOnce({ id: 'rfnd_1', status: 'processed' });
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status: 'refund_processing' }) });

    const response = await POST(makeRequest({ status: 'refunded' }), { params: Promise.resolve({ returnId: 'ret_1' }) });

    expect(response.status).toBe(200);
    expect(mockCreateRazorpayRefund).toHaveBeenCalledWith({ paymentId: 'pay_1', amount: 105000, notes: { returnId: 'ret_1' } });
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'refunded', razorpayRefundId: 'rfnd_1' })
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'refunded' });
    expect(mockTransactionSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'refunded' }));
    const body = await response.json();
    expect(body.razorpayRefundId).toBe('rfnd_1');
    expect(mockWriteNotification).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'refund',
      'Refund complete',
      expect.stringContaining('BP-2026-00001'),
      '/orders/order_1'
    );
  });

  it('[BE-19] writes a return history event on every status change', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'requested', orderId: 'order_1', userId: 'user_1', refundAmount: 1000 }),
    });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status: 'requested' }) });

    const response = await POST(makeRequest({ status: 'approved', staffNote: 'Looks legit' }), {
      params: Promise.resolve({ returnId: 'ret_1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved', staffNote: 'Looks legit', createdBy: 'staff_1' })
    );
  });

  it('returns 400 without calling Razorpay when the order has no payment to refund', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'refund_processing', orderId: 'order_1', refundAmount: 105000 }),
    });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });

    const response = await POST(makeRequest({ status: 'refunded' }), { params: Promise.resolve({ returnId: 'ret_1' }) });

    expect(response.status).toBe(400);
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('returns 409 when the in-transaction read shows the return already advanced concurrently', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReturnGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'requested', orderId: 'order_1', refundAmount: 1000 }) });
    mockOrderGet.mockResolvedValueOnce({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    // A concurrent request already moved it to 'rejected' by the time the transaction's own read runs.
    mockTransactionGet.mockResolvedValueOnce({ data: () => ({ status: 'rejected' }) });

    const response = await POST(makeRequest({ status: 'approved' }), { params: Promise.resolve({ returnId: 'ret_1' }) });

    expect(response.status).toBe(409);
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mockWriteNotification).not.toHaveBeenCalled();
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ status: 'approved' }), { params: Promise.resolve({ returnId: 'ret_1' }) });
    expect(response.status).toBe(429);
    expect(mockGetStaffUserId).not.toHaveBeenCalled();
  });
});
