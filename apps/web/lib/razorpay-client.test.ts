import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRazorpayOrder, createRazorpayRefund } from './razorpay-client';

vi.mock('server-only', () => ({}));

describe('createRazorpayOrder', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('posts to the Razorpay Orders API with Basic auth and returns the created order', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'order_rzp_1' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await createRazorpayOrder({ amount: 105000, currency: 'INR', receipt: 'BP-2026-00001' });

    expect(result).toEqual({ id: 'order_rzp_1' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ amount: 105000, currency: 'INR', receipt: 'BP-2026-00001' }),
      })
    );
  });

  it('throws when Razorpay responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }) as unknown as typeof fetch;

    await expect(createRazorpayOrder({ amount: 100, currency: 'INR', receipt: 'r1' })).rejects.toThrow(/401/);
  });

  it('throws when the API keys are not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(createRazorpayOrder({ amount: 100, currency: 'INR', receipt: 'r1' })).rejects.toThrow(
      /RAZORPAY_KEY_ID/
    );
  });
});

describe('createRazorpayRefund', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('posts to the Razorpay refund API with Basic auth and returns the refund', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'rfnd_1', status: 'processed' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await createRazorpayRefund({ paymentId: 'pay_1', amount: 105000 });

    expect(result).toEqual({ id: 'rfnd_1', status: 'processed' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_1/refund',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
        body: JSON.stringify({ amount: 105000 }),
      })
    );
  });

  it('includes notes in the request body when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'rfnd_1', status: 'processed' }) }) as unknown as typeof fetch;

    await createRazorpayRefund({ paymentId: 'pay_1', amount: 105000, notes: { returnId: 'ret_1' } });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ amount: 105000, notes: { returnId: 'ret_1' } }) })
    );
  });

  it('throws when Razorpay responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    }) as unknown as typeof fetch;

    await expect(createRazorpayRefund({ paymentId: 'pay_1', amount: 100 })).rejects.toThrow(/400/);
  });

  it('[ABE-23] sends the idempotency key as the X-Razorpay-Idempotency-Key header when given', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'rfnd_1', status: 'processed' }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    await createRazorpayRefund({ paymentId: 'pay_1', amount: 100, idempotencyKey: 'refund_abc123' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Razorpay-Idempotency-Key': 'refund_abc123' }) })
    );
  });

  it('[ABE-23] omits the idempotency header entirely when not given', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'rfnd_1', status: 'processed' }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    await createRazorpayRefund({ paymentId: 'pay_1', amount: 100 });

    const [, options] = mockFetch.mock.calls[0];
    expect('X-Razorpay-Idempotency-Key' in (options.headers as Record<string, string>)).toBe(false);
  });
});
