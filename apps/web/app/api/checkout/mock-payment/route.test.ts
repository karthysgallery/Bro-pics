import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: (...a: unknown[]) => mockGetUserId(...a) }));
vi.mock('../../../../lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockOrderGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => mockOrderGet() }) }) }),
}));

const mockSettleCaptured = vi.fn().mockResolvedValue(undefined);
const mockSettleFailed = vi.fn().mockResolvedValue(undefined);
vi.mock('@bro-pics/shared/src/payments/firestore-payment-tx', () => ({
  settlePaymentCaptured: (...a: unknown[]) => mockSettleCaptured(...a),
  settlePaymentFailed: (...a: unknown[]) => mockSettleFailed(...a),
}));

import { POST } from './route';

const mockOrder = (over: Record<string, unknown> = {}) => ({
  exists: true,
  data: () => ({
    userId: 'user_1',
    paymentProvider: 'mock',
    razorpayOrderId: 'order_mock_123_abcd',
    orderNo: 'BP-2026-00001',
    status: 'pending_payment',
    paymentStatus: 'pending',
    ...over,
  }),
});

const req = (body: unknown) =>
  new Request('https://example.com/api/checkout/mock-payment', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/checkout/mock-payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderGet.mockReset();
    process.env.PAYMENT_PROVIDER = 'mock';
    mockGetUserId.mockResolvedValue('user_1');
  });

  it('404s when the server is configured for real Razorpay — the route can never settle real orders', async () => {
    process.env.PAYMENT_PROVIDER = 'razorpay';
    process.env.RAZORPAY_KEY_ID = 'k';
    process.env.RAZORPAY_KEY_SECRET = 's';
    const res = await POST(req({ orderId: 'o1', outcome: 'success' }));
    expect(res.status).toBe(404);
    expect(mockSettleCaptured).not.toHaveBeenCalled();
  });

  it('401s without a signed-in user', async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(req({ orderId: 'o1', outcome: 'success' }));
    expect(res.status).toBe(401);
  });

  it('400s on a missing/invalid outcome', async () => {
    expect((await POST(req({ orderId: 'o1', outcome: 'refund' }))).status).toBe(400);
    expect((await POST(req({ outcome: 'success' }))).status).toBe(400);
  });

  it("404s (not 403) for another user's order, so ids can't be probed", async () => {
    mockOrderGet.mockResolvedValue(mockOrder({ userId: 'someone_else' }));
    const res = await POST(req({ orderId: 'o1', outcome: 'success' }));
    expect(res.status).toBe(404);
    expect(mockSettleCaptured).not.toHaveBeenCalled();
  });

  it('404s for an order that was not created by the mock provider', async () => {
    mockOrderGet.mockResolvedValue(mockOrder({ paymentProvider: 'razorpay', razorpayOrderId: 'order_real_1' }));
    expect((await POST(req({ orderId: 'o1', outcome: 'success' }))).status).toBe(404);
    // A real-looking order id on an order mislabelled 'mock' is refused too.
    mockOrderGet.mockResolvedValue(mockOrder({ razorpayOrderId: 'order_real_1' }));
    expect((await POST(req({ orderId: 'o1', outcome: 'success' }))).status).toBe(404);
    expect(mockSettleCaptured).not.toHaveBeenCalled();
  });

  it('success runs the shared capture pipeline with a stable idempotency event id', async () => {
    mockOrderGet.mockResolvedValue(mockOrder({ status: 'print_rendering', paymentStatus: 'paid' }));
    const res = await POST(req({ orderId: 'o1', outcome: 'success' }));
    expect(res.status).toBe(200);
    expect(mockSettleCaptured).toHaveBeenCalledWith(expect.anything(), {
      eventId: 'mock_evt_o1',
      razorpayOrderId: 'order_mock_123_abcd',
      razorpayPaymentId: 'pay_mock_o1',
    });
    expect(await res.json()).toMatchObject({ paymentStatus: 'paid', orderNo: 'BP-2026-00001' });
  });

  it('failure runs the shared failure handler and leaves the order retryable', async () => {
    mockOrderGet.mockResolvedValue(mockOrder({ paymentStatus: 'failed' }));
    const res = await POST(req({ orderId: 'o1', outcome: 'failure' }));
    expect(res.status).toBe(200);
    expect(mockSettleFailed).toHaveBeenCalledWith(expect.anything(), { razorpayOrderId: 'order_mock_123_abcd' });
    expect(mockSettleCaptured).not.toHaveBeenCalled();
  });

  it('cancel settles nothing', async () => {
    mockOrderGet.mockResolvedValue(mockOrder());
    const res = await POST(req({ orderId: 'o1', outcome: 'cancel' }));
    expect(res.status).toBe(200);
    expect(mockSettleCaptured).not.toHaveBeenCalled();
    expect(mockSettleFailed).not.toHaveBeenCalled();
  });
});
