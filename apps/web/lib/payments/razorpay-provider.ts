import { createRazorpayOrder } from '../razorpay-client';
import type { CreatedPayment, CreatePaymentParams, PaymentProvider } from './types';

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  constructor(private readonly keyId: string) {}

  async createPayment({ amount, receipt }: CreatePaymentParams): Promise<CreatedPayment> {
    const order = await createRazorpayOrder({ amount, currency: 'INR', receipt });
    return { providerOrderId: order.id, publicKey: this.keyId };
  }
}
