import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('server-only', () => ({}));

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: (...a: unknown[]) => mockGetUserId(...a) }));
vi.mock('../../../../lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockOrderGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => mockOrderGet() }) }) }),
}));

const mockSettle = vi.fn().mockResolvedValue(undefined);
vi.mock('@bro-pics/shared/src/payments/firestore-payment-tx', () => ({ settlePaymentCaptured: (...a: unknown[]) => mockSettle(...a) }));

const mockFetchPayment = vi.fn();
const mockCapture = vi.fn();
vi.mock('../../../../lib/razorpay-client', () => ({
  fetchRazorpayPayment: (...a: unknown[]) => mockFetchPayment(...a),
  captureRazorpayPayment: (...a: unknown[]) => mockCapture(...a),
}));

import { POST } from './route';

const SECRET = 'test_secret_for_unit_tests';
const sign = (o: string, p: string) => createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');
const order = (over: Record<string, unknown> = {}) => ({
  exists: true,
  data: () => ({ userId: 'user_1', paymentProvider: 'razorpay', razorpayOrderId: 'order_R1', total: 39900, orderNo: 'BP-1', status: 'pending_payment', paymentStatus: 'pending', ...over }),
});
const paid = { exists: true, data: () => ({ status: 'print_rendering', paymentStatus: 'paid', orderNo: 'BP-1' }) };
const body = (over: Record<string, unknown> = {}) => ({
  orderId: 'o1',
  razorpay_order_id: 'order_R1',
  razorpay_payment_id: 'pay_P1',
  razorpay_signature: sign('order_R1', 'pay_P1'),
  ...over,
});
const req = (b: unknown) =>
  new Request('https://example.com/api/checkout/verify-payment', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });

describe('POST /api/checkout/verify-payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_PROVIDER = 'razorpay';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    mockGetUserId.mockResolvedValue('user_1');
    mockOrderGet.mockReset().mockResolvedValueOnce(order()).mockResolvedValueOnce(paid);
    mockFetchPayment.mockResolvedValue({ id: 'pay_P1', order_id: 'order_R1', amount: 39900, currency: 'INR', status: 'captured' });
  });
  afterEach(() => {
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
  });

  it('settles a genuine, captured, full-amount payment through the shared pipeline', async () => {
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paymentStatus: 'paid', orderNo: 'BP-1' });
    expect(mockSettle).toHaveBeenCalledWith(expect.anything(), { eventId: 'checkout_pay_P1', razorpayOrderId: 'order_R1', razorpayPaymentId: 'pay_P1' });
  });

  it('captures a payment that was only authorized, then settles', async () => {
    mockFetchPayment.mockResolvedValue({ id: 'pay_P1', order_id: 'order_R1', amount: 39900, currency: 'INR', status: 'authorized' });
    mockCapture.mockResolvedValue({ id: 'pay_P1', order_id: 'order_R1', amount: 39900, currency: 'INR', status: 'captured' });
    expect((await POST(req(body()))).status).toBe(200);
    expect(mockCapture).toHaveBeenCalledWith('pay_P1', 39900);
    expect(mockSettle).toHaveBeenCalled();
  });

  it('rejects a forged signature without asking Razorpay or settling', async () => {
    const res = await POST(req(body({ razorpay_signature: sign('order_R1', 'pay_OTHER') })));
    expect(res.status).toBe(400);
    expect(mockFetchPayment).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('rejects a payment for a different amount or order', async () => {
    mockFetchPayment.mockResolvedValue({ id: 'pay_P1', order_id: 'order_R1', amount: 100, currency: 'INR', status: 'captured' });
    expect((await POST(req(body()))).status).toBe(400);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("refuses someone else's order and a payment that is not completed", async () => {
    mockGetUserId.mockResolvedValue('intruder');
    expect((await POST(req(body()))).status).toBe(404);

    mockGetUserId.mockResolvedValue('user_1');
    mockOrderGet.mockReset().mockResolvedValue(order());
    mockFetchPayment.mockResolvedValue({ id: 'pay_P1', order_id: 'order_R1', amount: 39900, currency: 'INR', status: 'failed' });
    expect((await POST(req(body()))).status).toBe(409);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('answers 202 (webhook will confirm) when Razorpay cannot be reached', async () => {
    mockFetchPayment.mockRejectedValue(new Error('network'));
    expect((await POST(req(body()))).status).toBe(202);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('is unavailable while the shop runs simulated payments', async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    expect((await POST(req(body()))).status).toBe(404);
  });
});
