'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ConsentStatus, Customer, Invoice } from '@bro-pics/shared';
import { useAdminApi } from '../../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, Stat, button, card, dateTime, input, money, sectionTitle } from '../../../../../components/admin/billing/ui';

/** A customer's profile: online orders + in-store purchases, totals, invoices, consent. */
export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useAdminApi();
  const [data, setData] = useState<{ customer: Customer; invoices: Invoice[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('in store');
  const load = useCallback(() => {
    api<{ customer: Customer; invoices: Invoice[] }>(`/api/admin/billing/customers/${id}`).then(setData).catch((e: Error) => setError(e.message));
  }, [api, id]);
  useEffect(load, [load]);
  const setConsent = async (kind: 'transactional' | 'marketing', status: ConsentStatus) => {
    try {
      await api(`/api/admin/billing/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ [kind]: status, source }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };
  if (!data) return <div className="p-8">{error ? <Notice tone="error">{error}</Notice> : <p className="text-xs text-ink/50">Loading…</p>}</div>;
  const { customer: c, invoices } = data;
  const consentRow = (kind: 'transactional' | 'marketing', label: string, help: string) => {
    const k = c.consent[kind];
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          <p className="text-sm font-semibold text-ink">{label} <Badge value={k.status} /></p>
          <p className="text-2xs text-ink/55">{help}{k.at ? ` · recorded ${dateTime(k.at)} (${k.source})` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={button} disabled={k.status === 'opted_in'} onClick={() => void setConsent(kind, 'opted_in')}>Opted in</button>
          <button type="button" className={button} disabled={k.status === 'opted_out'} onClick={() => void setConsent(kind, 'opted_out')}>Opted out</button>
        </div>
      </div>
    );
  };
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-8">
      <PageHeader title={c.name}>{c.phone}{c.email ? ` · ${c.email}` : ''}{c.userId ? ' · has a website account' : ' · in-store customer'}</PageHeader>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Online orders" value={String(c.stats.onlineOrders)} />
        <Stat label="In-store purchases" value={String(c.stats.posPurchases)} />
        <Stat label="Total spent" value={money(c.stats.totalSpent)} hint="after refunds" />
        <Stat label="Last purchase" value={c.stats.lastPurchaseAt ? new Date(c.stats.lastPurchaseAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'} />
      </div>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}>WhatsApp consent</h2>
          <label className="flex items-center gap-2 text-2xs text-ink/60">
            Customer told us
            <input className={`${input} h-8 w-36`} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Where the customer told us" />
          </label>
        </div>
        {consentRow('transactional', 'Invoices and order updates', 'Sent unless the customer opts out')}
        {consentRow('marketing', 'Offers and campaigns', 'Only sent after an opt-in; a STOP reply opts out at once')}
      </section>
      <section className={card}>
        <h2 className={sectionTitle}>Invoices</h2>
        <ul className="divide-y divide-line text-sm">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/admin/billing/invoices/${i.id}`} className="font-mono underline">{i.invoiceNo}</Link>
              <span className="text-xs text-ink/60">{i.channel === 'online' ? `Online · ${i.orderNo}` : 'In store'} · {dateTime(i.issuedAt)}</span>
              <span className="tabular-nums">{i.kind === 'credit_note' ? '−' : ''}{money(i.total)}</span>
              <Badge value={i.status} />
            </li>
          ))}
          {invoices.length === 0 && <li className="py-4 text-xs text-ink/50">No invoices yet.</li>}
        </ul>
      </section>
    </div>
  );
}
