'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { Invoice } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, card, dateTime, input, money, primaryButton } from '../../../../components/admin/billing/ui';

/** Admin → Billing → Bills / Invoices (also "Online orders", "Returns / Refunds" via filters). */
function InvoicesList() {
  const api = useAdminApi();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [channel, setChannel] = useState(params.get('channel') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sidebar links (online orders, returns) change only the URL: follow it.
  useEffect(() => {
    setChannel(params.get('channel') ?? '');
    setKind(params.get('kind') ?? '');
    setQ(params.get('q') ?? '');
  }, [params]);

  const load = useCallback(async () => {
    setError(null);
    const p = new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(channel && { channel }), ...(kind && { kind }), ...(status && { status }), ...(from && { from }), ...(to && { to }) });
    try {
      const r = await api<{ invoices: Invoice[]; truncated: boolean }>(`/api/admin/billing/invoices?${p}`);
      setRows(r.invoices);
      setTruncated(r.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invoices could not be loaded.');
    }
  }, [api, q, channel, kind, status, from, to]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const title = kind === 'credit_note' ? 'Returns / Refunds' : channel === 'online' ? 'Online order invoices' : channel === 'pos' ? 'In-store bills' : 'Bills / Invoices';
  const sel = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm text-ink';
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6 md:p-8">
      <PageHeader title={title} actions={<Link href="/admin/billing/new" className={primaryButton}>New bill</Link>}>
        {kind === 'credit_note'
          ? 'Credit notes for in-store returns and online refunds. Start an in-store return from the bill itself.'
          : 'Every invoice, online and in store, from the same invoice engine. Online invoices are created automatically when payment is confirmed.'}
      </PageHeader>
      <section className={`${card} grid gap-2 md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]`} aria-label="Filters">
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no, order no, customer or phone" aria-label="Search" />
        <select className={sel} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
          <option value="">Online + store</option>
          <option value="online">Online</option>
          <option value="pos">In store</option>
        </select>
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">Invoices + credit notes</option>
          <option value="invoice">Invoices</option>
          <option value="credit_note">Credit notes</option>
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partially_refunded">Partially refunded</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input className={sel} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input className={sel} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      {!from && !to && !q && <p className="text-2xs text-ink/50">Showing the last 30 days. Pick dates to see older bills, or search an exact invoice number.</p>}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left text-2xs uppercase tracking-wider text-ink/55">
              <th className="p-3">Number</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Channel</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows === null ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-ink/50">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-ink/50">
                  No bills match these filters.
                </td>
              </tr>
            ) : (
              rows.map((i) => (
                <tr key={i.id} className="hover:bg-field/40">
                  <td className="p-3">
                    <Link href={`/admin/billing/invoices/${i.id}`} className="font-mono font-semibold text-ink underline-offset-2 hover:underline">
                      {i.invoiceNo}
                    </Link>
                    {i.kind === 'credit_note' && <span className="block text-2xs text-ink/55">Credit note · {i.originalInvoiceNo}</span>}
                    {i.orderNo && <span className="block text-2xs text-ink/55">Order {i.orderNo}</span>}
                  </td>
                  <td className="p-3 text-xs text-ink/70">{dateTime(i.issuedAt)}</td>
                  <td className="p-3">
                    <span className="text-ink">{i.customer.name}</span>
                    <span className="block text-2xs text-ink/55">{i.customer.phone ?? ''}</span>
                  </td>
                  <td className="p-3 text-xs">{i.channel === 'online' ? 'Online' : 'In store'}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">
                    {i.kind === 'credit_note' ? '−' : ''}
                    {money(i.total)}
                  </td>
                  <td className="p-3">
                    <Badge value={i.status} />
                  </td>
                  <td className="p-3">
                    <Badge value={i.whatsapp.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      {truncated && <p className="text-2xs text-ink/55">Showing the newest 500. Narrow the dates to see the rest.</p>}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesList />
    </Suspense>
  );
}
