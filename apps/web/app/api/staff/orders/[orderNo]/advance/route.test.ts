import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrder = vi.fn();
vi.mock('../../../../../../lib/order-lookup', () => ({ findOrderByOrderNo: (...args: unknown[]) => mockFindOrder(...args) }));

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

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/orders/BP-2026-00001/advance', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/orders/[orderNo]/advance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, set: mockTransactionSet, update: mockTransactionUpdate })
    );
  });

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 when no order matches the order number', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-99999' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 when advancing to shipped without courier/awbNumber', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'printed_packed' } });
    const response = await POST(makeRequest({ status: 'shipped' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status transition', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'pending_payment' } });
    const response = await POST(makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123' }), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('advances a valid transition, writes an event, and updates the order', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });

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

  it('sets courier/awbNumber on the order when advancing to shipped', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });

    const response = await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' })
    );
  });
});
