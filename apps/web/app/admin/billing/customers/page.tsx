'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Customer } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, dateTime, input, money } from '../../../../components/admin/billing/ui';

/** Admin → Billing → Customers: one record per mobile number, online and in store. */
export default function BillingCustomersPage() {
  const api = useAdminApi();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ customers: Customer[] }>(`/api/admin/billing/customers?q=${encodeURIComponent(q)}`)
        .then((r) => setRows(r.customers))
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [api, q]);
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <PageHeader title="Customers">One record per mobile number: website orders and in-store purchases together, with WhatsApp consent.</PageHeader>
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or mobile" aria-label="Search customers" />
      {error && <Notice tone="error">{error}</Notice>}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left text-2xs uppercase tracking-wider text-ink/55">
              <th className="p-3">Customer</th>
              <th className="p-3 text-right">Online</th>
              <th className="p-3 text-right">In store</th>
              <th className="p-3 text-right">Total spent</th>
              <th className="p-3">Last purchase</th>
              <th className="p-3">WhatsApp</th>
              <th className="p-3">Offers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-field/40">
                <td className="p-3">
                  <Link href={`/admin/billing/customers/${c.id}`} className="font-semibold text-ink hover:underline">{c.name}</Link>
                  <span className="block text-2xs text-ink/55">{c.phone}{c.userId ? ' · website account' : ''}</span>
                </td>
                <td className="p-3 text-right tabular-nums">{c.stats.onlineOrders}</td>
                <td className="p-3 text-right tabular-nums">{c.stats.posPurchases}</td>
                <td className="p-3 text-right tabular-nums">{money(c.stats.totalSpent)}</td>
                <td className="p-3 text-xs text-ink/70">{dateTime(c.stats.lastPurchaseAt)}</td>
                <td className="p-3"><Badge value={c.consent.transactional.status} /></td>
                <td className="p-3"><Badge value={c.consent.marketing.status} /></td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-xs text-ink/50">No customers yet. They are added with their first bill or online order.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
