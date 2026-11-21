'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';
import { PaymentBadge, ProductThumb } from '../../../../components/admin/OrderBadges';
import { PaymentCheck } from '../../../../components/admin/PaymentCheck';
import { ageText, matchesSearch, paymentState, type OrderRow, type PaymentState } from '../../../../lib/admin-orders-view';

/*
 * Payments: the money side of every order, in four lists. Failed = Razorpay reported a failed attempt and nothing
 * has been paid since. Awaiting = order placed, no payment yet (still paying, or the customer left checkout; the
 * age tells which is likely, and "Check with Razorpay" shows what really happened). Paid and Refunded are records.
 */

const TABS: { id: PaymentState; label: string; empty: string }[] = [
  { id: 'failed', label: 'Failed', empty: 'No failed payments. When Razorpay reports a failed payment, the order appears here.' },
  { id: 'pending', label: 'Awaiting payment', empty: 'Every order placed has been paid or closed.' },
  { id: 'paid', label: 'Paid', empty: 'No paid orders yet.' },
  { id: 'refunded', label: 'Refunded', empty: 'No refunds yet.' },
];

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function PaymentsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'failed') as PaymentState;
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [canSeeCustomers, setCanSeeCustomers] = useState(false);
  const [refundsUnknown, setRefundsUnknown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/overview', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see payments.' : 'Payments could not be loaded.');
      const body = (await res.json()) as { orders: OrderRow[]; canSeeCustomers: boolean; refundsUnavailable?: boolean };
      setRows(body.orders ?? []);
      setCanSeeCustomers(body.canSeeCustomers);
      setRefundsUnknown(Boolean(body.refundsUnavailable));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const byState = useMemo(() => {
    const m: Record<PaymentState, OrderRow[]> = { failed: [], pending: [], paid: [], refunded: [] };
    for (const o of rows) m[paymentState(o)].push(o);
    return m;
  }, [rows]);
  const list = useMemo(() => byState[tab].filter((o) => matchesSearch(o, q)), [byState, tab, q]);
  const totalMoney = list.reduce((s, o) => s + (tab === 'refunded' ? o.refundedAmount || o.total : o.total), 0);

  const name = (o: OrderRow) =>
    canSeeCustomers && o.userId ? (
      <Link href={`/admin/customers/${o.userId}`} className="font-medium text-ink hover:text-gold-deep hover:underline">{o.customerName ?? 'Customer'}</Link>
    ) : (
      <span className="font-medium text-ink">{o.customerName ?? 'Customer'}</span>
    );

  const detail = (o: OrderRow) => {
    switch (tab) {
      case 'failed':
        return (
          <>
            <p className="text-ink/80">{o.paymentFailure?.reason ? `Razorpay: ${o.paymentFailure.reason}` : 'Reason not saved for this order. Use "Check with Razorpay".'}</p>
            <p className="text-xs text-ink/50">Failed {o.paymentFailure?.at ? when(o.paymentFailure.at) : 'at an unrecorded time'}{o.paymentFailure?.razorpayPaymentId ? ` · ${o.paymentFailure.razorpayPaymentId}` : ''}</p>
          </>
        );
      case 'pending': {
        const recent = o.placedAt && Date.now() - Date.parse(o.placedAt) < 60 * 60 * 1000;
        return (
          <>
            <p className="text-ink/80">{recent ? 'May still be paying' : 'Checkout not completed'}</p>
            <p className="text-xs text-ink/50">Placed {ageText(o.placedAt)}{o.status === 'cancelled' ? ' · order cancelled' : ''}</p>
          </>
        );
      }
      case 'paid':
        return (
          <>
            <p className="font-mono text-xs text-ink/80">{o.razorpayPaymentId ?? (o.paymentProvider === 'mock' ? 'Test payment' : '—')}</p>
            <p className="text-xs text-ink/50">
              {o.paymentProvider === 'mock' ? 'Test payment system' : 'Razorpay'}
              {o.paymentMode === 'partial_cod' ? ` · ${formatPaise(o.amountPaidOnline)} paid, ${formatPaise(o.amountDueOnDelivery)} on delivery` : ''}
              {o.invoiceNo ? ` · Invoice ${o.invoiceNo}` : ''}
              {o.refundedAmount > 0 ? ` · ${formatPaise(o.refundedAmount)} refunded` : ''}
            </p>
          </>
        );
      case 'refunded':
        return (
          <>
            <p className="text-ink/80">{o.refundedAmount > 0 ? `${formatPaise(o.refundedAmount)} refunded` : 'Refunded'}{o.refundedAmount > 0 && o.refundedAmount < o.total ? ` of ${formatPaise(o.total)}` : ''}</p>
            <p className="text-xs text-ink/50">See the order for refund details</p>
          </>
        );
    }
  };

  const detailHeading = { failed: 'Why it failed', pending: 'What it means', paid: 'Transaction', refunded: 'Refund' }[tab];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Payments</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            The money side of each order. A payment counts as paid only when Razorpay confirms it to the shop&apos;s server.
          </p>
        </div>
        <Link href="/admin/orders" className="self-start rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint sm:self-auto">All orders</Link>
      </header>

      {refundsUnknown && (
        <p role="status" className="rounded-xl border border-alert/30 bg-paper px-3 py-2 text-xs text-ink">Refund amounts could not be loaded just now, so the Paid and Refunded lists may be incomplete. Reload to try again.</p>
      )}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" role="tablist" aria-label="Payment lists">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { router.replace(`${pathname}?tab=${t.id}`, { scroll: false }); setOpen(null); }}
            className={`flex items-center justify-between gap-2 rounded-card border bg-paper px-4 py-3 text-left transition-colors ${tab === t.id ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink/30'}`}
          >
            <PaymentBadge state={t.id} size="sm" />
            <span className="font-display text-xl font-bold text-ink tabular-nums">{loading ? '…' : byState[t.id].length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-sm">
          <span className="sr-only">Search payments</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, name, phone or payment ID" className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none" />
        </label>
        {!loading && list.length > 0 && (
          <p className="text-sm text-ink/60">{list.length} order{list.length === 1 ? '' : 's'} · {formatPaise(totalMoney)}</p>
        )}
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-tint" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper px-6 py-12 text-center">
          <p className="font-semibold text-ink">{q ? 'Nothing matches that search.' : TABS.find((t) => t.id === tab)!.empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
          <li className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_7rem_minmax(0,1.4fr)_auto] gap-4 bg-field/60 px-4 py-2.5 text-xs text-ink/55 md:grid">
            <span>Order</span><span>Customer</span><span className="text-right">Amount</span><span>{detailHeading}</span><span className="sr-only">Actions</span>
          </li>
          {list.map((o) => (
            <li key={o.id} className="px-4 py-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_7rem_minmax(0,1.4fr)_auto] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ProductThumb src={o.productImage} alt="" size={36} />
                  <div className="min-w-0">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-gold-deep">#{o.orderNo}</Link>
                    <p className="truncate text-xs text-ink/55">{o.productTitle ?? 'Product'} · {when(o.placedAt)}</p>
                  </div>
                </div>
                <div className="min-w-0 text-sm">
                  <div className="truncate">{name(o)}</div>
                  <p className="truncate text-xs text-ink/55">{o.phone ?? ''}</p>
                </div>
                <p className="text-sm font-semibold text-ink tabular-nums md:text-right">{formatPaise(o.total)}</p>
                <div className="min-w-0 text-sm">{detail(o)}</div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {(tab === 'failed' || tab === 'pending') && (
                    <button onClick={() => setOpen(open === o.id ? null : o.id)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink hover:bg-tint" aria-expanded={open === o.id}>
                      {open === o.id ? 'Hide check' : 'Razorpay'}
                    </button>
                  )}
                  <Link href={`/admin/orders/${o.id}`} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-tint">View order</Link>
                </div>
              </div>
              {open === o.id && (
                <div className="mt-3 md:pl-12">
                  <PaymentCheck orderId={o.id} compact />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink/60">Loading payments…</div>}>
      <PaymentsScreen />
    </Suspense>
  );
}
