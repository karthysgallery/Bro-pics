'use client';

import Link from 'next/link';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import { useAuth } from '../../../../lib/auth-context';
import { Card } from '../../../../components/ui/Card';

const SUPPORTED_METHODS = [
  { label: 'UPI', desc: 'Pay via Google Pay, PhonePe, Paytm, or any UPI app' },
  { label: 'Credit card', desc: 'Visa, Mastercard, RuPay, and American Express' },
  { label: 'Debit card', desc: 'Visa, Mastercard, RuPay' },
  { label: 'Net banking', desc: 'All major Indian banks' },
  { label: 'Wallets', desc: 'Paytm, Mobikwik, and other supported wallets' },
];

// A real informational page, not a fake "saved cards" list — this app's
// Razorpay integration collects and verifies payment at checkout time; it
// doesn't tokenize or store a card/UPI ID for reuse. Building a saved-
// payment-method UI without that backing would mean fabricating account
// data, so this page instead shows what's actually supported. True saved-
// card storage stays a documented backend gap.
export default function PaymentMethodsPage() {
  const { user } = useAuth();

  if (!user) return <SignedOutNotice action="see your payment methods" />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Payment methods</h1>
      <p className="text-sm text-ink/60">
        You don&apos;t need to save a payment method in advance — choose any of these when you check out.
      </p>

      <ul className="flex flex-col gap-3">
        {SUPPORTED_METHODS.map((method) => (
          <Card as="li" key={method.label} className="flex flex-col gap-0.5">
            <span className="font-medium text-ink">{method.label}</span>
            <span className="text-sm text-ink/60">{method.desc}</span>
          </Card>
        ))}
      </ul>
    </main>
  );
}
