export type PaymentProviderName = 'mock' | 'razorpay';

export interface CreatePaymentParams {
  /** Amount in paise — always the server-computed order total. */
  amount: number;
  /** Our own order number, passed through as the provider's receipt. */
  receipt: string;
}

export interface CreatedPayment {
  /** Stored on the order as `razorpayOrderId` (the field name predates the abstraction). */
  providerOrderId: string;
  /** Public checkout key the browser needs to open the provider UI; null for the mock provider. */
  publicKey: string | null;
}

/**
 * Everything checkout needs from a payment gateway. The rest of the app
 * only ever talks to this interface (via getPaymentProvider), so swapping
 * the mock for real Razorpay is an env change (PAYMENT_PROVIDER=razorpay),
 * not a rewrite.
 *
 * Settlement (capture/failure) is NOT part of this interface: for Razorpay
 * it arrives as a signed webhook, for the mock provider it arrives from the
 * /api/checkout/mock-payment route. Both end in the same shared
 * settlePaymentCaptured/settlePaymentFailed code.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPayment(params: CreatePaymentParams): Promise<CreatedPayment>;
}

export class PaymentNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentNotConfiguredError';
  }
}
