import { randomBytes } from 'node:crypto';
import type { CreatedPayment, CreatePaymentParams, PaymentProvider } from './types';

/** Prefix that marks a provider order id as mock — the mock-payment route refuses anything else. */
export const MOCK_PAYMENT_ORDER_PREFIX = 'order_mock_';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  async createPayment(_params: CreatePaymentParams): Promise<CreatedPayment> {
    return {
      providerOrderId: `${MOCK_PAYMENT_ORDER_PREFIX}${Date.now()}_${randomBytes(4).toString('hex')}`,
      publicKey: null,
    };
  }
}
