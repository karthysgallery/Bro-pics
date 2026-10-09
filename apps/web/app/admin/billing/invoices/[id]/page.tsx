'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Invoice, PaymentMethod, PosSale, WhatsAppMessage } from '@bro-pics/shared';
import { useAdminApi } from '../../../../../components/admin/template-builder/use-admin-api';
import { Badge, METHOD_LABEL, Notice, PageHeader, button, card, dateTime, input, money, primaryButton, sectionTitle, useInvoicePdf } from '../../../../../components/admin/billing/ui';

interface Detail {
  invoice: Invoice;
  sale: PosSale | null;
  returns: Array<{ id: string; creditNoteId: string; creditNoteNo: string; amount: number; reason: string | null; restocked: boolean; at: string }>;
  creditNotes: Invoice[];
  messages: WhatsAppMessage[];
  can: { download: boolean; sendWhatsApp: boolean; refund: boolean };
}

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** One bill: what was sold, payment, status, PDF / print / WhatsApp, credit notes, and (in store) returns. */
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useAdminApi();
  const openPdf = useInvoicePdf();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);

  const load = useCallback(() => {
    api<Detail>(`/api/admin/billing/invoices/${id}`)
      .then(setD)
      .catch((e: Error) => setError(e.message));
  }, [api, id]);
  useEffect(load, [load]);

  if (error && !d) return <div className="p-8"><Notice tone="error">{error}</Notice></div>;
  if (!d) return <p className="p-8 text-xs text-ink/50">Loading…</p>;
  const { invoice: inv, sale } = d;
  const pdf = (mode: 'open' | 'download' | 'print') => void openPdf(inv.id, mode, inv.invoiceNo).catch((e: Error) => setError(e.message));

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ whatsapp: { status: string; error: string | null } }>(`/api/admin/billing/invoices/${inv.id}/whatsapp`, { method: 'POST', body: '{}' });
      setNotice(r.whatsapp.status === 'sent' ? 'Invoice sent on WhatsApp.' : `Not sent: ${r.whatsapp.error}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
      load();
    }
  };

  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([i, n]) => ({ lineIndex: Number(i), qty: n }));
  const returnTotal = sale ? items.reduce((s, r) => { const l = sale.lines[r.lineIndex]!; return s + l.unitPrice * r.qty - Math.round((l.discount * r.qty) / l.qty); }, 0) : 0;
  const submitReturn = async () => {
    if (!sale || !items.length || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ creditNoteNo: string; amount: number }>(`/api/admin/billing/sales/${sale.id}/returns`, { method: 'POST', body: JSON.stringify({ clientRequestId: newRequestId(), items, refundMethod: method, reason: reason.trim(), restock }) });
      setNotice(`Credit note ${r.creditNoteNo} issued: refund ${money(r.amount)} by ${METHOD_LABEL[method]}.${restock ? ' Items are back in stock.' : ''}`);
      setReturning(false);
      setQty({});
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The return could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-8">
      <PageHeader
        title={`${inv.kind === 'credit_note' ? 'Credit note' : 'Invoice'} ${inv.invoiceNo}`}
        actions={
          <>
            {d.can.download && (
              <>
                <button type="button" className={button} onClick={() => pdf('open')}>View PDF</button>
                <button type="button" className={button} onClick={() => pdf('print')}>Print</button>
                <button type="button" className={button} onClick={() => pdf('download')}>Download</button>
              </>
            )}
            {d.can.sendWhatsApp && inv.customer.phone && (
              <button type="button" className={button} disabled={busy} onClick={() => void resend()}>
                {inv.whatsapp.status === 'sent' || inv.whatsapp.status === 'delivered' || inv.whatsapp.status === 'read' ? 'Resend WhatsApp' : 'Send WhatsApp'}
              </button>
            )}
          </>
        }
      >
        {inv.channel === 'online' ? 'Online order' : 'In-store sale'} · {dateTime(inv.issuedAt)}
        {inv.orderId && (
          <>
            {' · '}
            <Link className="underline" href={`/admin/orders/${inv.orderId}`}>Order {inv.orderNo}</Link>
          </>
        )}
        {inv.originalInvoiceId && (
          <>
            {' · against '}
            <Link className="underline" href={`/admin/billing/invoices/${inv.originalInvoiceId}`}>{inv.originalInvoiceNo}</Link>
          </>
        )}
      </PageHeader>
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-5 md:grid-cols-3">
        <section className={card}>
          <h2 className={sectionTitle}>Customer</h2>
          <p className="text-sm font-semibold text-ink">{inv.customer.name}</p>
          <p className="text-xs text-ink/70">{[inv.customer.phone, inv.customer.email].filter(Boolean).join(' · ')}</p>
          {inv.shippingAddress && <p className="text-xs text-ink/70">{inv.shippingAddress.join(', ')}</p>}
          {inv.customerId && <Link href={`/admin/billing/customers/${inv.customerId}`} className="text-xs font-semibold text-ink underline">Customer profile</Link>}
        </section>
        <section className={card}>
          <h2 className={sectionTitle}>Status</h2>
          <p><Badge value={inv.status} /></p>
          {inv.refundedAmount > 0 && inv.kind === 'invoice' && <p className="text-xs text-ink/70">Refunded {money(inv.refundedAmount)} of {money(inv.total)}</p>}
          <p className="text-xs text-ink/70">WhatsApp: <Badge value={inv.whatsapp.status} /></p>
          {inv.whatsapp.error && <p className="text-2xs text-alert">{inv.whatsapp.error}</p>}
        </section>
        <section className={card}>
          <h2 className={sectionTitle}>{inv.kind === 'credit_note' ? 'Refunded by' : 'Payment'}</h2>
          {inv.payments.map((p, i) => (
            <p key={i} className="text-sm text-ink">
              {METHOD_LABEL[p.method] ?? p.method} · <span className="tabular-nums">{money(p.amount)}</span>
              {p.reference && <span className="block text-2xs text-ink/55">Ref {p.reference}</span>}
            </p>
          ))}
        </section>
      </div>

      <section className={card}>
        <h2 className={sectionTitle}>Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-ink/55">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Unit price</th>
                <th className="py-2 pr-2 text-right">Discount</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                {returning && <th className="py-2 text-right">Return</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inv.lines.map((l, i) => {
                const left = sale ? l.qty - (sale.returnedQty[i] ?? 0) : 0;
                return (
                  <tr key={i}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-ink">{l.title}</span>
                      <span className="block text-2xs text-ink/55">{[l.variantLabel, l.sku].filter(Boolean).join(' · ')}</span>
                      {sale && sale.returnedQty[i]! > 0 && <span className="block text-2xs text-orange-800">{sale.returnedQty[i]} returned</span>}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.qty}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.discount ? `−${money(l.discount)}` : '—'}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{money(l.lineTotal)}</td>
                    {returning && (
                      <td className="py-2 text-right">
                        <input
                          aria-label={`Units of ${l.title} to return`}
                          className="h-8 w-16 rounded-lg border border-line text-right"
                          type="number"
                          min={0}
                          max={left}
                          disabled={left === 0}
                          value={qty[i] ?? ''}
                          placeholder={`0–${left}`}
                          onChange={(e) => setQty((q) => ({ ...q, [i]: Math.max(0, Math.min(left, Number(e.target.value) || 0)) }))}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-ink/60">Subtotal</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
          {inv.discount > 0 && <div className="flex justify-between"><dt className="text-ink/60">Discount{inv.couponCode ? ` (${inv.couponCode})` : ''}</dt><dd className="tabular-nums">−{money(inv.discount)}</dd></div>}
          {inv.channel === 'online' && <div className="flex justify-between"><dt className="text-ink/60">Shipping</dt><dd className="tabular-nums">{inv.shipping ? money(inv.shipping) : 'Free'}</dd></div>}
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
          {inv.taxLines.map((t) => <p key={t.rate} className="text-right text-2xs text-ink/55">Includes GST {t.rate}%: {money(t.amount)}</p>)}
        </dl>
      </section>

      {sale && inv.kind === 'invoice' && d.can.refund && sale.status !== 'returned' && (
        <section className={card} aria-labelledby="return">
          <div className="flex items-center justify-between">
            <h2 id="return" className={sectionTitle}>Return / refund</h2>
            {!returning && <button type="button" className={button} onClick={() => setReturning(true)}>Return items</button>}
          </div>
          {returning ? (
            <div className="space-y-3">
              <p className="text-xs text-ink/60">Enter how many of each item come back above. A numbered credit note is issued; the bill itself is never changed.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <select className={input} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="Refund method">
                  {(['cash', 'upi', 'card', 'other'] as const).map((m) => <option key={m} value={m}>Refund by {METHOD_LABEL[m]}</option>)}
                </select>
                <input className={`${input} sm:col-span-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (wrong size, damaged…)" aria-label="Reason" />
              </div>
              <label className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 accent-[#14213D]" />
                Put the items back in stock (untick for damaged goods)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={primaryButton} disabled={busy || !items.length || !reason.trim()} onClick={() => void submitReturn()}>
                  {busy ? 'Saving…' : `Refund ${money(returnTotal)}`}
                </button>
                <button type="button" className={button} onClick={() => setReturning(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink/60">Full or partial return of this in-store bill.</p>
          )}
        </section>
      )}
      {inv.channel === 'online' && inv.kind === 'invoice' && (
        <p className="text-xs text-ink/60">Online refunds are made from the <Link className="underline" href={`/admin/orders/${inv.orderId}`}>order</Link>; the credit note appears here automatically.</p>
      )}

      {(d.creditNotes.length > 0 || d.returns.length > 0) && (
        <section className={card}>
          <h2 className={sectionTitle}>Credit notes</h2>
          <ul className="divide-y divide-line text-sm">
            {d.creditNotes.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/billing/invoices/${c.id}`} className="font-mono underline">{c.invoiceNo}</Link>
                <span className="text-xs text-ink/60">{dateTime(c.issuedAt)}</span>
                <span className="tabular-nums">−{money(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.messages.length > 0 && (
        <section className={card}>
          <h2 className={sectionTitle}>WhatsApp messages</h2>
          <ul className="divide-y divide-line text-xs">
            {d.messages.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{m.template} → {m.to}</span>
                <Badge value={m.status} />
                <span className="text-ink/55">{dateTime(m.updatedAt)}</span>
                {m.error && <span className="w-full text-alert">{m.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
