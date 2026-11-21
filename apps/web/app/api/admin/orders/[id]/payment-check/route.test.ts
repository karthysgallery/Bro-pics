import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));
vi.mock('../../../../../../lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn() }));
const mockFetchPayments = vi.fn();
vi.mock('../../../../../../lib/razorpay-client', () => ({ fetchRazorpayOrderPayments: (...a: unknown[]) => mockFetchPayments(...a) }));

let orderData: Record<string, unknown> | null = null;
const update = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: orderData !== null, data: () => orderData }), update }) }) }),
}));

import { GET } from './route';
const call = () => GET(new Request('http://x/api/admin/orders/o1/payment-check'), { params: Promise.resolve({ id: 'o1' }) });

describe('GET /api/admin/orders/[id]/payment-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'a' });
  });

  it('shows each Razorpay attempt with Razorpay\'s own reason, and never changes the order', async () => {
    orderData = { paymentProvider: 'razorpay', razorpayOrderId: 'order_X', total: 55500, paymentStatus: 'failed' };
    mockFetchPayments.mockResolvedValue([
      { id: 'pay_1', amount: 55500, currency: 'INR', status: 'failed', method: 'upi', created_at: 1795200000, error_code: 'BAD_REQUEST_ERROR', error_description: 'Payment was cancelled by the user', error_reason: null },
    ]);
    const body = await (await call()).json();
    expect(body.attempts[0]).toMatchObject({ id: 'pay_1', status: 'failed', method: 'upi', reason: 'Payment was cancelled by the user', matchesOrder: true });
    expect(body.message).toMatch(/failed/);
    expect(update).not.toHaveBeenCalled();
  });

  it('flags a captured payment the shop has not recorded, without marking it paid', async () => {
    orderData = { paymentProvider: 'razorpay', razorpayOrderId: 'order_X', total: 55500, paymentStatus: 'pending' };
    mockFetchPayments.mockResolvedValue([{ id: 'pay_2', amount: 55500, currency: 'INR', status: 'captured', method: 'card', created_at: 1795200000, error_code: null, error_description: null, error_reason: null }]);
    const body = await (await call()).json();
    expect(body.message).toMatch(/not recorded it yet/);
    expect(update).not.toHaveBeenCalled();
  });

  it('answers plainly for test payments and orders that never reached Razorpay', async () => {
    orderData = { paymentProvider: 'mock' };
    expect((await (await call()).json()).source).toBe('test');
    orderData = { paymentProvider: 'razorpay' };
    expect((await (await call()).json()).source).toBe('none');
    expect(mockFetchPayments).not.toHaveBeenCalled();
  });

  it('reports Razorpay being unreachable as an error, not as "no payment"', async () => {
    orderData = { paymentProvider: 'razorpay', razorpayOrderId: 'order_X', total: 100 };
    mockFetchPayments.mockRejectedValue(new Error('down'));
    expect((await call()).status).toBe(502);
  });
});
