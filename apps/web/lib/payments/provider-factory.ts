import { MockPaymentProvider } from './mock-provider';
import { RazorpayPaymentProvider } from './razorpay-provider';
import { PaymentNotConfiguredError, type PaymentProvider } from './types';

/**
 * Picks the payment provider from SERVER env only — never from a request.
 *
 *   PAYMENT_PROVIDER=mock      -> MockPaymentProvider (no money moves)
 *   PAYMENT_PROVIDER=razorpay  -> RazorpayPaymentProvider (needs RAZORPAY_KEY_ID/SECRET)
 *   unset                      -> mock outside production, FAIL CLOSED in production
 *
 * Failing closed matters: the old behavior silently treated every order as
 * paid whenever the Razorpay key was missing, so a forgotten env var meant
 * free orders. Now a production deploy has to opt into mock explicitly.
 */
export function getPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const configured = (env.PAYMENT_PROVIDER ?? '').trim().toLowerCase();

  if (configured === 'mock') return new MockPaymentProvider();

  if (configured === 'razorpay') {
    const keyId = env.RAZORPAY_KEY_ID;
    if (!keyId || !env.RAZORPAY_KEY_SECRET) {
      throw new PaymentNotConfiguredError('PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
    }
    return new RazorpayPaymentProvider(keyId);
  }

  if (configured === '') {
    if (env.NODE_ENV === 'production') {
      throw new PaymentNotConfiguredError('PAYMENT_PROVIDER is not set (expected "mock" or "razorpay")');
    }
    return new MockPaymentProvider();
  }

  throw new PaymentNotConfiguredError(`Unknown PAYMENT_PROVIDER "${configured}" (expected "mock" or "razorpay")`);
}
