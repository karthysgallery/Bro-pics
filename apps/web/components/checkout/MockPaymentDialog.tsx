'use client';

import { useEffect, useRef } from 'react';
import { formatPaise } from '../../lib/format-price';

export type MockPaymentOutcome = 'success' | 'failure' | 'cancel';

interface MockPaymentDialogProps {
  amountPaise: number;
  orderNo?: string;
  /** True while the chosen outcome is being sent to the server. */
  busy: boolean;
  onChoose: (outcome: MockPaymentOutcome) => void;
}

/**
 * Stand-in for the Razorpay checkout window while PAYMENT_PROVIDER=mock.
 * It exists so every payment outcome (success, failure, dismissed window)
 * is exercisable end to end with the real order/settlement pipeline behind
 * it. Plainly labelled as test mode: no money moves and nothing is charged.
 * Deleted from the user's path the moment PAYMENT_PROVIDER=razorpay.
 */
export function MockPaymentDialog({ amountPaise, orderNo, busy, onChoose }: MockPaymentDialogProps) {
  const payButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    payButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onChoose('cancel');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onChoose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="mock-payment-title">
      <div className="absolute inset-0 bg-ink/50" onClick={busy ? undefined : () => onChoose('cancel')} />
      <div className="relative bg-paper w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-line p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gold/30 text-ink px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider">Test mode</span>
          <span className="text-2xs text-ink/60">No real payment is taken</span>
        </div>

        <div>
          <h2 id="mock-payment-title" className="font-display text-xl font-bold text-ink">Complete payment</h2>
          {orderNo && <p className="text-xs text-ink/60 mt-0.5">Order {orderNo}</p>}
          <p className="font-display text-3xl font-bold text-ink mt-3">{formatPaise(amountPaise)}</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            ref={payButtonRef}
            type="button"
            disabled={busy}
            onClick={() => onChoose('success')}
            className="w-full min-h-[48px] rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {busy ? 'Processing…' : `Pay ${formatPaise(amountPaise)}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose('failure')}
            className="w-full min-h-[44px] rounded-full border border-line text-ink text-sm font-semibold hover:border-alert hover:text-alert transition-colors disabled:opacity-40"
          >
            Simulate a failed payment
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose('cancel')}
            className="w-full min-h-[44px] rounded-full text-ink/70 text-sm font-semibold hover:text-ink transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
