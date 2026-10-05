import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateRazorpayRefund = vi.fn();
vi.mock('../razorpay-client', () => ({ createRazorpayRefund: (...a: unknown[]) => mockCreateRazorpayRefund(...a) }));

import { refundPayment } from './refunds';

describe('refundPayment', () => {
  beforeEach(() => {
    mockCreateRazorpayRefund.mockReset();
  });

  it('settles a MOCK order locally and instantly, never calling the gateway', async () => {
    const result = await refundPayment({ paymentProvider: 'mock' }, { paymentId: 'pay_mock_o1', amount: 5000, idempotencyKey: 'refund_1' });
    expect(result).toEqual({ id: 'rfnd_mock_refund_1', status: 'processed' });
    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
  });

  it('is stable for a retried mock refund (same idempotency key => same refund id)', async () => {
    const a = await refundPayment({ paymentProvider: 'mock' }, { paymentId: 'pay_mock_o1', amount: 5000, idempotencyKey: 'k' });
    const b = await refundPayment({ paymentProvider: 'mock' }, { paymentId: 'pay_mock_o1', amount: 5000, idempotencyKey: 'k' });
    expect(a.id).toBe(b.id);
  });

  it('sends a Razorpay order to Razorpay with every parameter intact', async () => {
    mockCreateRazorpayRefund.mockResolvedValue({ id: 'rfnd_real_1', status: 'processed' });
    const request = { paymentId: 'pay_123', amount: 7000, notes: { orderId: 'o1' }, idempotencyKey: 'refund_2' };
    const result = await refundPayment({ paymentProvider: 'razorpay' }, request);
    expect(mockCreateRazorpayRefund).toHaveBeenCalledWith(request);
    expect(result).toEqual({ id: 'rfnd_real_1', status: 'processed' });
  });

  it('treats a legacy order with no recorded provider as Razorpay (it can only have been)', async () => {
    mockCreateRazorpayRefund.mockResolvedValue({ id: 'rfnd_real_2', status: 'pending' });
    const result = await refundPayment({}, { paymentId: 'pay_old', amount: 100 });
    expect(mockCreateRazorpayRefund).toHaveBeenCalledOnce();
    expect(result.status).toBe('pending');
  });

  it('lets a gateway failure propagate so the route can mark the refund failed', async () => {
    mockCreateRazorpayRefund.mockRejectedValue(new Error('Razorpay refund failed (400)'));
    await expect(refundPayment({ paymentProvider: 'razorpay' }, { paymentId: 'pay_1', amount: 1 })).rejects.toThrow('400');
  });
});
