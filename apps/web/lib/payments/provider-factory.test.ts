import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../razorpay-client', () => ({ createRazorpayOrder: vi.fn() }));

import { getPaymentProvider } from './provider-factory';
import { PaymentNotConfiguredError } from './types';

const env = (vars: Record<string, string | undefined>) => vars as unknown as NodeJS.ProcessEnv;

describe('getPaymentProvider', () => {
  it('returns the mock provider when PAYMENT_PROVIDER=mock, even in production', () => {
    expect(getPaymentProvider(env({ PAYMENT_PROVIDER: 'mock', NODE_ENV: 'production' })).name).toBe('mock');
  });

  it('is case/whitespace tolerant', () => {
    expect(getPaymentProvider(env({ PAYMENT_PROVIDER: '  MOCK ' })).name).toBe('mock');
  });

  it('returns razorpay only when both keys are present', () => {
    const provider = getPaymentProvider(env({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' }));
    expect(provider.name).toBe('razorpay');
  });

  it('throws (never silently falls back to mock) when razorpay is selected without keys', () => {
    expect(() => getPaymentProvider(env({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'k' }))).toThrow(PaymentNotConfiguredError);
    expect(() => getPaymentProvider(env({ PAYMENT_PROVIDER: 'razorpay' }))).toThrow(PaymentNotConfiguredError);
  });

  it('defaults to mock outside production when unset', () => {
    expect(getPaymentProvider(env({ NODE_ENV: 'development' })).name).toBe('mock');
    expect(getPaymentProvider(env({ NODE_ENV: 'test' })).name).toBe('mock');
  });

  it('fails closed in production when unset, even if Razorpay keys happen to exist', () => {
    expect(() => getPaymentProvider(env({ NODE_ENV: 'production' }))).toThrow(PaymentNotConfiguredError);
    expect(() =>
      getPaymentProvider(env({ NODE_ENV: 'production', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' }))
    ).toThrow(PaymentNotConfiguredError);
  });

  it('rejects an unknown provider name', () => {
    expect(() => getPaymentProvider(env({ PAYMENT_PROVIDER: 'stripe' }))).toThrow(PaymentNotConfiguredError);
  });

  it('mock provider ids carry the prefix the mock-payment route requires', async () => {
    const created = await getPaymentProvider(env({ PAYMENT_PROVIDER: 'mock' })).createPayment({ amount: 100, receipt: 'BP-1' });
    expect(created.providerOrderId.startsWith('order_mock_')).toBe(true);
    expect(created.publicKey).toBeNull();
  });
});
