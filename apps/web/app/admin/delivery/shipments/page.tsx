'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';

/*
 * Shipments: real orders only. "Ready to ship" lists packed orders waiting for a courier; "Shipped" lists orders
 * already handed over, with the courier and AWB staff entered when they marked the order shipped. Marking an order
 * shipped happens on the order page, so the customer is notified and the order history stays complete.
 */

interface Row {
  id: string;
  orderNo: string;
  status: string;
  total: number;
  customerName: string | null;
  phone: string | null;
  destination: string | null;
  pincode: string | null;
  placedAt: string | null;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  hasGlitter: boolean;
}

type View = 'ready' | 'shipped';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function daysSince(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    packed: { label: 'Packed', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    printed_packed: { label: 'Packed', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    shipped: { label: 'On the way', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
    delivered: { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-tint text-ink border-line' };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export default function ShipmentsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('ready');
  const [ready, setReady] = useState<Row[]>([]);
  const [shipped, setShipped] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/shipments', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see shipments.' : 'Shipments could not be loaded.');
      const body = (await res.json()) as { readyToShip?: Row[]; shipped?: Row[] };
      setReady(body.readyToShip ?? []);
      setShipped(body.shipped ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Shipments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = view === 'ready' ? ready : shipped;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) =>
      [r.orderNo, r.customerName, r.destination, r.pincode, r.courier, r.awb].some((v) => v?.toLowerCase().includes(q)) ||
      (digits.length >= 4 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8 print:p-0">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Shipments</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Packed orders waiting for the courier, and orders already sent. To send an order, open it and choose
            <span className="font-medium text-ink"> Shipped</span> with the courier and AWB number; the customer gets the tracking details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={filtered.length === 0}
          className="self-start rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-tint disabled:opacity-40 print:hidden sm:self-auto"
        >
          Print this list
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex gap-1 rounded-full border border-line bg-paper p-0.5 self-start" role="tablist" aria-label="Shipments">
          {([
            ['ready', 'Ready to ship', ready.length],
            ['shipped', 'Shipped', shipped.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                view === id ? 'bg-ink font-semibold text-paper' : 'text-ink/65 hover:text-ink'
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${view === id ? 'bg-paper/20' : 'bg-tint'}`}>{count}</span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Search shipments</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order, name, phone, city or AWB"
            className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none"
          />
        </label>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-tint" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper px-6 py-12 text-center">
          <p className="font-semibold text-ink">
            {query ? 'Nothing matches that search.' : view === 'ready' ? 'No packed orders are waiting.' : 'No orders have been shipped yet.'}
          </p>
          <p className="mt-1 text-sm text-ink/60">
            {view === 'ready'
              ? 'Orders appear here once they pass the quality check and are marked Packed.'
              : 'Orders appear here once they are marked Shipped on the order page.'}
          </p>
        </div>
      ) : (
        <>
          {/* Phone: one card per order */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="rounded-card border border-line bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/orders/${r.id}`} className="font-semibold text-ink hover:text-gold-deep">#{r.orderNo}</Link>
                    <p className="text-sm text-ink/70">{r.customerName ?? 'Customer'}{r.destination ? ` · ${r.destination}` : ''}</p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                {view === 'shipped' ? (
                  <p className="mt-2 text-sm text-ink/80">
                    {r.courier ?? 'Courier not recorded'}
                    {r.awb && (
                      <> · {r.trackingUrl ? <a href={r.trackingUrl} target="_blank" rel="noreferrer" className="font-mono text-gold-deep underline">{r.awb}</a> : <span className="font-mono">{r.awb}</span>}</>
                    )}
                  </p>
                ) : (
                  <Link href={`/admin/orders/${r.id}`} className="mt-3 inline-block rounded-full bg-gold px-3.5 py-1.5 text-sm font-semibold text-ink">Open to ship</Link>
                )}
              </li>
            ))}
          </ul>

          {/* Tablet and up: a table */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-paper md:block print:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-xs text-ink/55">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Deliver to</th>
                  {view === 'shipped' ? (
                    <>
                      <th className="px-4 py-3 font-medium">Courier & AWB</th>
                      <th className="px-4 py-3 font-medium">Shipped</th>
                    </>
                  ) : (
                    <th className="px-4 py-3 font-medium">Ordered</th>
                  )}
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 print:hidden"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-field/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${r.id}`} className="font-semibold text-ink hover:text-gold-deep">#{r.orderNo}</Link>
                      <p className="text-xs text-ink/55">{formatPaise(r.total)}{r.hasGlitter ? ' · Glitter' : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{r.customerName ?? '—'}</p>
                      {r.phone && <p className="text-xs text-ink/55">{r.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {r.destination ?? '—'}
                      {r.pincode && <p className="text-xs text-ink/55">{r.pincode}</p>}
                    </td>
                    {view === 'shipped' ? (
                      <>
                        <td className="px-4 py-3">
                          <p className="text-ink">{r.courier ?? <span className="text-ink/50">Not recorded</span>}</p>
                          {r.awb && (r.trackingUrl ? (
                            <a href={r.trackingUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-gold-deep underline">{r.awb}</a>
                          ) : (
                            <p className="font-mono text-xs text-ink/70">{r.awb}</p>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-ink/80">{formatDate(r.shippedAt)}{r.deliveredAt && <p className="text-xs text-ink/55">Delivered {formatDate(r.deliveredAt)}</p>}</td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-ink/80">{formatDate(r.placedAt)}<p className="text-xs text-ink/55">{daysSince(r.placedAt)}</p></td>
                    )}
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3 text-right print:hidden">
                      <Link
                        href={`/admin/orders/${r.id}`}
                        className={view === 'ready' ? 'rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-ink hover:bg-gold-deep' : 'text-xs font-semibold text-gold-deep hover:underline'}
                      >
                        {view === 'ready' ? 'Open to ship' : 'View order'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
