'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { formatPaise } from '../../../lib/format-price';
import { StatusChip } from '../../../components/admin/StatusChip';
import { AdminModal } from '../../../components/admin/AdminModal';
import { FormField } from '../../../components/admin/AdminForm';
import { PaymentBadge, ProductThumb } from '../../../components/admin/OrderBadges';
import { useToast } from '../../../components/ui/Toast';
import {
  countOrders,
  filterOrders,
  filtersFromParams,
  filtersToParams,
  paymentState,
  STAGE_FILTERS,
  DEFAULT_FILTERS,
  type OrderFilters,
  type OrderRow,
} from '../../../lib/admin-orders-view';
import type { OrderStatus } from '@bro-pics/shared';

const PAGE_SIZE = 25;

function formatPlaced(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }),
  };
}

const select = 'rounded-full border border-line bg-paper py-1.5 pl-3 pr-8 text-sm text-ink focus:border-gold focus:outline-none';

function SummaryCard({ label, value, note, tone, active, onClick, icon }: {
  label: string; value: number; note: string; tone: string; active: boolean; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={note}
      className={`group flex min-w-0 flex-col rounded-card border bg-paper p-3.5 text-left transition-colors sm:p-4 ${active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink/30'}`}
    >
      <span className="flex items-center gap-2 text-xs text-ink/65">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${tone}`} aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-2 font-display text-2xl font-bold text-ink tabular-nums">{value}</span>
    </button>
  );
}

function OrdersScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [truncated, setTruncated] = useState<{ on: boolean; limit: number }>({ on: false, limit: 500 });
  const [canSeeCustomers, setCanSeeCustomers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);
  const [searchText, setSearchText] = useState(filters.q);

  // Bulk status change (kept from the earlier screen)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<OrderStatus>('in_production');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const setFilters = useCallback((next: Partial<OrderFilters>) => {
    const merged = { ...filters, ...next };
    router.replace(`${pathname}${filtersToParams(merged)}`, { scroll: false });
    setPage(0);
  }, [filters, pathname, router]);

  // The search box filters as you type (after a short pause), and the address bar keeps it. A search that
  // arrives from the address bar (back button, a shared link) is copied into the box instead of being undone.
  const typedRef = useRef(false);
  useEffect(() => {
    if (!typedRef.current) setSearchText(filters.q);
  }, [filters.q]);
  useEffect(() => {
    if (!typedRef.current || searchText === filters.q) return;
    const t = setTimeout(() => {
      typedRef.current = false;
      setFilters({ q: searchText });
    }, 250);
    return () => clearTimeout(t);
  }, [searchText, filters.q, setFilters]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/overview', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see orders.' : 'Orders could not be loaded.');
      const body = (await res.json()) as { orders: OrderRow[]; truncated: boolean; limit: number; canSeeCustomers: boolean };
      setRows(body.orders ?? []);
      setTruncated({ on: body.truncated, limit: body.limit });
      setCanSeeCustomers(body.canSeeCustomers);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Orders could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => countOrders(rows), [rows]);
  const visible = useMemo(() => filterOrders(rows, filters), [rows, filters]);
  const pageRows = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const anyFilter = filtersToParams({ ...filters, sort: 'newest' }) !== '';

  const cardIs = (payment: OrderFilters['payment'], stage: string) =>
    filters.payment === payment && filters.stage === stage && !filters.q && filters.date === 'all' && filters.method === 'all';
  const applyCard = (payment: OrderFilters['payment'], stage: string) => {
    setSearchText('');
    router.replace(`${pathname}${filtersToParams({ ...DEFAULT_FILTERS, payment, stage, sort: filters.sort })}`, { scroll: false });
    setPage(0);
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((o) => selected.has(o.id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const runBulk = async () => {
    if (!user || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/bulk-transition', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [...selected], toStatus: bulkTarget, note: bulkNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error('The orders could not be moved.');
      const data = (await res.json()) as { results?: { ok: boolean }[] };
      const ok = data.results?.filter((r) => r.ok).length ?? 0;
      const skipped = selected.size - ok;
      showToast(`${ok} order${ok === 1 ? '' : 's'} moved${skipped ? `; ${skipped} could not move to that step from where they are` : ''}`, skipped ? 'error' : 'success');
      setBulkOpen(false);
      setBulkNote('');
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The orders could not be moved.', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('The CSV could not be downloaded.', 'error');
    }
  };

  const customerCell = (o: OrderRow) => {
    const name = o.customerName ?? 'Customer';
    return canSeeCustomers && o.userId ? (
      <Link href={`/admin/customers/${o.userId}`} className="font-medium text-ink hover:text-gold-deep hover:underline">{name}</Link>
    ) : (
      <span className="font-medium text-ink">{name}</span>
    );
  };

  const paymentNote = (o: OrderRow) => {
    const state = paymentState(o);
    if (state === 'paid' && o.paymentMode === 'partial_cod') return `${formatPaise(o.amountPaidOnline)} paid · ${formatPaise(o.amountDueOnDelivery)} on delivery`;
    if (state === 'refunded' && o.refundedAmount > 0 && o.refundedAmount < o.total) return `${formatPaise(o.refundedAmount)} refunded`;
    if (o.paymentProvider === 'mock') return 'Test payment';
    return null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Orders</h1>
          <p className="mt-1 text-sm text-ink/60">Payment and production are shown separately: one tells you about the money, the other where the frame is.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/admin/orders/payments" className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Payments</Link>
          <Link href="/admin/production" className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Production board</Link>
          <button onClick={() => void exportCsv()} className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Export CSV</button>
        </div>
      </header>

      <section aria-label="Order summary" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="All orders" value={counts.total} note="Every order, paid or not" tone="bg-tint text-ink" active={cardIs('all', '')} onClick={() => applyCard('all', '')} icon={<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>} />
        <SummaryCard label="Paid" value={counts.paid} note="Payment received" tone="bg-emerald-50 text-emerald-700" active={cardIs('paid', '')} onClick={() => applyCard('paid', '')} icon={<path d="M5 12.5l4.5 4.5L19 7.5" />} />
        <SummaryCard label="Payment failed" value={counts.failed} note="Razorpay reported a failed payment and nothing has been paid since" tone="bg-red-50 text-red-700" active={cardIs('failed', '')} onClick={() => applyCard('failed', '')} icon={<path d="M7 7l10 10M17 7L7 17" />} />
        <SummaryCard label="Awaiting payment" value={counts.pending} note="Order placed, no payment received yet" tone="bg-amber-50 text-amber-700" active={cardIs('pending', '')} onClick={() => applyCard('pending', '')} icon={<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>} />
        <SummaryCard label="Being made" value={counts.processing} note="Paid, from photo check to quality check" tone="bg-blue-50 text-blue-700" active={cardIs('all', 'processing')} onClick={() => applyCard('all', 'processing')} icon={<path d="M4 20h16M6 16l4-8 4 5 2-3 2 6" />} />
        <SummaryCard label="Ready to ship" value={counts.readyToShip} note="Packed, waiting for the courier" tone="bg-teal-50 text-teal-700" active={cardIs('all', 'ready')} onClick={() => applyCard('all', 'ready')} icon={<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>} />
      </section>

      {truncated.on && (
        <p className="rounded-xl bg-tint px-3 py-2 text-xs text-ink/70">Counts and search cover your latest {truncated.limit} orders. Use Export CSV for older ones.</p>
      )}

      <section className="space-y-3 rounded-card border border-line bg-paper p-3 sm:p-4" aria-label="Find orders">
        <label className="relative block">
          <span className="sr-only">Search orders</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={searchText}
            onChange={(e) => { typedRef.current = true; setSearchText(e.target.value); }}
            placeholder="Search order number, customer name, phone, email or product"
            className="w-full rounded-full border border-line bg-field/50 py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:bg-paper focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-line bg-field/50 p-0.5" role="group" aria-label="Payment">
            {([['all', 'All payments'], ['paid', 'Paid'], ['failed', 'Failed'], ['pending', 'Awaiting'], ['refunded', 'Refunded']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilters({ payment: v })}
                aria-pressed={filters.payment === v}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors ${filters.payment === v ? 'bg-ink font-medium text-paper' : 'text-ink/65 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="f-stage">Order status</label>
          <select id="f-stage" value={filters.stage} onChange={(e) => setFilters({ stage: e.target.value })} className={select}>
            <option value="">Any order status</option>
            <option value="processing">Being made (all steps)</option>
            <option value="ready">Ready to ship</option>
            <optgroup label="Step">
              {STAGE_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </optgroup>
          </select>
          <label className="sr-only" htmlFor="f-date">Order date</label>
          <select id="f-date" value={filters.date} onChange={(e) => setFilters({ date: e.target.value as OrderFilters['date'] })} className={select}>
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <label className="sr-only" htmlFor="f-method">Payment method</label>
          <select id="f-method" value={filters.method} onChange={(e) => setFilters({ method: e.target.value as OrderFilters['method'] })} className={select}>
            <option value="all">Any payment method</option>
            <option value="prepaid">Paid in full online</option>
            <option value="partial_cod">Advance + cash on delivery</option>
          </select>
          <label className="sr-only" htmlFor="f-sort">Sort</label>
          <select id="f-sort" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as OrderFilters['sort'] })} className={select}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount_high">Highest amount</option>
            <option value="amount_low">Lowest amount</option>
          </select>
          {anyFilter && (
            <button onClick={() => { setSearchText(''); router.replace(pathname, { scroll: false }); setPage(0); }} className="rounded-full px-3 py-1.5 text-sm font-medium text-gold-deep hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </section>

      <div className="flex min-h-[2rem] flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/60" aria-live="polite">
          {loading ? 'Loading orders…' : `${visible.length} order${visible.length === 1 ? '' : 's'}`}
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-sm text-paper">
            <span>{selected.size} selected</span>
            <button onClick={() => setBulkOpen(true)} className="rounded-full bg-gold px-3 py-0.5 text-xs font-semibold text-ink">Change status</button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-paper/70 hover:text-paper">Clear</button>
          </div>
        )}
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-tint" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper px-6 py-12 text-center">
          <p className="font-semibold text-ink">{rows.length === 0 ? 'No orders yet.' : 'No orders match these filters.'}</p>
          {anyFilter && <button onClick={() => { setSearchText(''); router.replace(pathname, { scroll: false }); }} className="mt-2 text-sm font-medium text-gold-deep hover:underline">Clear filters</button>}
        </div>
      ) : (
        <>
          {/* Phone and small tablet: one card per order */}
          <ul className="space-y-2 lg:hidden">
            {pageRows.map((o) => {
              const when = formatPlaced(o.placedAt);
              return (
                <li key={o.id} className="rounded-card border border-line bg-paper p-3.5">
                  <div className="flex items-start gap-3">
                    <ProductThumb src={o.productImage} alt="" size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink">#{o.orderNo}</Link>
                        <span className="font-semibold text-ink tabular-nums">{formatPaise(o.total)}</span>
                      </div>
                      <p className="truncate text-sm text-ink/75">{o.customerName ?? 'Customer'}{o.city ? ` · ${o.city}` : ''}</p>
                      <p className="text-xs text-ink/50">{when.date}, {when.time}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <PaymentBadge state={paymentState(o)} size="sm" />
                    {o.status !== 'pending_payment' && <StatusChip status={o.status} size="sm" className="whitespace-nowrap" />}
                    {o.hasGlitter && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">Glitter</span>}
                    <Link href={`/admin/orders/${o.id}`} className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-tint">View order</Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Laptop and up: a table */}
          <div className="hidden overflow-x-auto rounded-card border border-line bg-paper lg:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-xs text-ink/55">
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...pageRows.map((o) => o.id)]) : new Set([...selected].filter((id) => !pageRows.some((o) => o.id === id))))} className="h-4 w-4 rounded border-line accent-[rgb(var(--color-ink))]" />
                  </th>
                  <th className="px-3 py-3 font-medium">Order</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Payment</th>
                  <th className="px-3 py-3 font-medium">Order status</th>
                  <th className="px-3 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageRows.map((o) => {
                  const when = formatPlaced(o.placedAt);
                  const note = paymentNote(o);
                  return (
                    <tr key={o.id} className={`align-middle hover:bg-field/40 ${selected.has(o.id) ? 'bg-gold/10' : ''}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" aria-label={`Select order ${o.orderNo}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-line accent-[rgb(var(--color-ink))]" />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/admin/orders/${o.id}`} className="whitespace-nowrap font-semibold text-ink hover:text-gold-deep">#{o.orderNo}</Link>
                        {o.hasGlitter && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">Glitter</span>}
                      </td>
                      <td className="max-w-[11rem] px-3 py-3">
                        <div className="truncate">{customerCell(o)}</div>
                        <p className="truncate text-xs text-ink/55">{o.phone ?? ''}{o.city ? ` · ${o.city}` : ''}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink/80">{when.date}<p className="text-xs text-ink/50">{when.time}</p></td>
                      <td className="max-w-[13rem] px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <ProductThumb src={o.productImage} alt="" />
                          <div className="min-w-0">
                            <p className="truncate text-ink">{o.productTitle ?? 'Product'}</p>
                            {o.productCount > 1 && <p className="text-xs text-ink/50">+{o.productCount - 1} more</p>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-ink tabular-nums">{formatPaise(o.total)}</td>
                      <td className="px-3 py-3">
                        <PaymentBadge state={paymentState(o)} />
                        {note && <p className="mt-1 text-[11px] text-ink/55">{note}</p>}
                      </td>
                      <td className="px-3 py-3">
                        {o.status === 'pending_payment' ? <span className="text-xs text-ink/45">Starts after payment</span> : <StatusChip status={o.status} size="sm" className="whitespace-nowrap" />}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/admin/orders/${o.id}`} className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-tint">View order</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pages">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-full border border-line bg-paper px-3.5 py-1.5 font-medium text-ink hover:bg-tint disabled:opacity-40">Previous</button>
              <span className="text-ink/60">Page {page + 1} of {pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-full border border-line bg-paper px-3.5 py-1.5 font-medium text-ink hover:bg-tint disabled:opacity-40">Next</button>
            </nav>
          )}
        </>
      )}

      <AdminModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title={`Change status of ${selected.size} order${selected.size === 1 ? '' : 's'}`}>
        <div className="space-y-4">
          <FormField label="Move to" required>
            <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value as OrderStatus)} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none">
              <option value="print_rendering">Rendering</option>
              <option value="in_production">In production</option>
              <option value="quality_check">Quality check</option>
              <option value="packed">Packed</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FormField>
          <p className="text-xs text-ink/60">Only orders that can move to this step from where they are will move; the rest stay as they are. To mark orders shipped, open each order and add the courier and AWB.</p>
          <FormField label="Note (optional)">
            <input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder="Shown in each order's history" className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none" />
          </FormField>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setBulkOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-tint">Cancel</button>
            <button onClick={() => void runBulk()} disabled={bulkBusy} className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-deep disabled:opacity-40">
              {bulkBusy ? 'Moving…' : 'Move orders'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8 text-sm text-ink/60">Loading orders…</div>}>
      <OrdersScreen />
    </Suspense>
  );
}
