'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { formatPaise } from '../../lib/format-price';

interface Attempt {
  id: string;
  status: string;
  amount: number;
  method: string | null;
  at: string;
  reason: string | null;
  code: string | null;
  matchesOrder: boolean;
}

const STATUS_WORDS: Record<string, string> = {
  created: 'Started',
  authorized: 'Approved, not yet collected',
  captured: 'Paid',
  refunded: 'Refunded',
  failed: 'Failed',
};
const METHOD_WORDS: Record<string, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI' };

/** Asks Razorpay (read-only) what happened to this order's payment, and shows its answer in plain words. */
export function PaymentCheck({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; attempts: Attempt[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/payment-check`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Razorpay could not be checked.');
      setResult({ message: body.message, attempts: body.attempts ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Razorpay could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void check()}
        disabled={busy}
        className={`rounded-full border border-line bg-paper font-medium text-ink hover:bg-tint disabled:opacity-50 ${compact ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'}`}
      >
        {busy ? 'Checking…' : result ? 'Check again' : 'Check with Razorpay'}
      </button>
      {error && <p role="alert" className="text-xs text-alert">{error}</p>}
      {result && (
        <div className="rounded-xl bg-field px-3 py-2.5 text-xs text-ink/80" aria-live="polite">
          <p className="font-medium text-ink">{result.message}</p>
          {result.attempts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {result.attempts.map((a) => (
                <li key={a.id} className="border-t border-line/70 pt-1.5 first:border-0 first:pt-0">
                  <span className="font-medium text-ink">{STATUS_WORDS[a.status] ?? a.status}</span>
                  {' · '}{formatPaise(a.amount)}{a.method ? ` · ${METHOD_WORDS[a.method] ?? a.method}` : ''}
                  {' · '}{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {a.reason && <span className="block text-ink/70">Razorpay: {a.reason}</span>}
                  {!a.matchesOrder && <span className="block text-alert">This amount does not match the order total.</span>}
                  <span className="block font-mono text-[11px] text-ink/45">{a.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
