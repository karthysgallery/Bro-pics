export type PaymentMode = 'mock' | 'razorpay';

// Display-only: tells checkout whether to describe the payment step as test
// mode. The server independently decides the provider on every order, so a
// failure here (null) just falls back to the generic copy.
export async function getPaymentModeClient(): Promise<PaymentMode | null> {
  try {
    const res = await fetch('/api/checkout/payment-mode');
    if (!res.ok) return null;
    const body = await res.json();
    return body?.provider === 'mock' || body?.provider === 'razorpay' ? body.provider : null;
  } catch {
    return null;
  }
}
