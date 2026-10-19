'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WhatsAppMessage } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, dateTime, input } from '../../../../components/admin/billing/ui';

type Row = WhatsAppMessage & { customerName: string | null };

/** Admin → WhatsApp → Message logs: every OTP, transactional and marketing message and what happened to it. */
export default function WhatsAppMessageLogsPage() {
  const api = useAdminApi();
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ ...(category && { category }), ...(status && { status }), ...(q.trim() && { q: q.trim() }) });
      api<{ messages: Row[] }>(`/api/admin/whatsapp/messages?${p}`).then((r) => setRows(r.messages)).catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [api, category, status, q]);
  const sel = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm text-ink';
  const relatedLink = (m: Row) => (m.related?.type === 'invoice' ? `/admin/billing/invoices/${m.related.id}` : m.related?.type === 'order' ? `/admin/orders/${m.related.id}` : m.related?.type === 'campaign' ? '/admin/marketing/whatsapp' : null);
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6 md:p-8">
      <PageHeader title="WhatsApp message logs">Every message the shop sent on WhatsApp. OTP codes themselves are never stored. Use the failure reason to see why a message did not arrive.</PageHeader>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_1fr_1fr]">
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mobile number" aria-label="Search by mobile number" />
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Type">
          <option value="">All types</option><option value="otp">OTP</option><option value="transactional">Transactional</option><option value="marketing">Marketing</option>
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option><option value="queued">Queued</option><option value="sent">Sent</option><option value="delivered">Delivered</option><option value="read">Read</option><option value="failed">Failed</option>
        </select>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left text-2xs uppercase tracking-wider text-ink/55">
              <th className="p-3">Customer</th><th className="p-3">Type</th><th className="p-3">Template</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3">Provider message id</th><th className="p-3">Tries</th><th className="p-3">Failure reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((m) => {
              const link = relatedLink(m);
              return (
                <tr key={m.id} className={m.status === 'failed' ? 'bg-red-50/40' : ''}>
                  <td className="p-3"><span className="text-ink">{m.customerName ?? '—'}</span><span className="block font-mono text-2xs text-ink/55">{m.to}</span></td>
                  <td className="p-3 text-xs">{m.category}{m.provider === 'mock' && <span className="block text-2xs text-ink/50">test mode</span>}</td>
                  <td className="p-3 text-xs">{link ? <Link className="underline" href={link}>{m.template}</Link> : m.template}</td>
                  <td className="p-3"><Badge value={m.status} /></td>
                  <td className="p-3 text-xs text-ink/70">{dateTime(m.createdAt)}</td>
                  <td className="p-3 font-mono text-2xs text-ink/60">{m.providerMessageId ?? '—'}</td>
                  <td className="p-3 text-xs text-ink/70">{m.attempts ?? '—'}{m.status === 'failed' && m.nextAttemptAt && <span className="block text-2xs text-ink/50">next try {dateTime(m.nextAttemptAt)}</span>}{m.status === 'failed' && !m.nextAttemptAt && m.event && <span className="block text-2xs text-alert">gave up</span>}</td>
                  <td className="p-3 text-xs text-alert">{m.error ?? ''}</td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-xs text-ink/50">No messages match.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
