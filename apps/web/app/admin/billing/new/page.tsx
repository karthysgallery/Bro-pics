'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { BillingSettings, ConsentStatus, Customer, PaymentMethod } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, METHOD_LABEL, Notice, PageHeader, button, card, input, money, primaryButton, sectionTitle, useInvoicePdf } from '../../../../components/admin/billing/ui';
import type { CatalogueHit } from '../../../api/admin/billing/catalogue/route';

/**
 * Admin → Billing / POS → New Bill. Built for the shop counter (laptop or
 * tablet): customer → search → bill → discount → payment → complete →
 * invoice → WhatsApp / print. Keyboard: "/" search, ↑↓ Enter add,
 * Ctrl+Enter complete. Figures on screen are a preview; the server prices
 * the bill again from the catalogue and is the only source of the invoice.
 */

interface Line extends CatalogueHit {
  qty: number;
  discountPercent: number;
}
interface Settings {
  settings: BillingSettings;
  gst: { enabled: boolean; rate: number };
  whatsappMode: string;
}
interface Done {
  invoiceId: string;
  invoiceNo: string;
  total: number;
  pdf: 'ready' | 'failed';
  whatsapp: { status: string; error: string | null };
}

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const lineGross = (l: Line) => l.price * l.qty;
const lineDiscount = (l: Line) => Math.round((lineGross(l) * l.discountPercent) / 100);

export default function NewBillPage() {
  const api = useAdminApi();
  const openPdf = useInvoicePdf();
  const [cfg, setCfg] = useState<Settings | null>(null);

  // Customer
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<{ customer: Customer | null; account: { name: string | null } | null } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [whatsappOk, setWhatsappOk] = useState(true);
  const [marketingOk, setMarketingOk] = useState<ConsentStatus | null>(null);

  // Products
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CatalogueHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Payment
  const [methods, setMethods] = useState<Array<{ method: PaymentMethod; amount: string; reference: string }>>([{ method: 'cash', amount: '', reference: '' }]);
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    api<Settings>('/api/admin/billing/settings')
      .then((s) => {
        setCfg(s);
        setMethods([{ method: s.settings.paymentMethods[0] ?? 'cash', amount: '', reference: '' }]);
      })
      .catch((e: Error) => setError(e.message));
  }, [api]);

  // "/" jumps to product search (unless typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Customer lookup once a full number is typed.
  useEffect(() => {
    const digits = phone.replace(/\D/g, '');
    setFound(null);
    setLookupError(null);
    if (digits.length < 10) return;
    const t = setTimeout(() => {
      api<{ customer: Customer | null; account: { name: string | null; email: string | null } | null }>(`/api/admin/billing/customers?phone=${encodeURIComponent(phone)}`)
        .then((r) => {
          setFound(r);
          if (r.customer) {
            setName(r.customer.name);
            setEmail(r.customer.email ?? '');
            setWhatsappOk(r.customer.consent.transactional.status !== 'opted_out');
            setMarketingOk(null);
          } else if (r.account) {
            if (r.account.name) setName(r.account.name);
            if (r.account.email) setEmail(r.account.email);
          }
        })
        .catch((e: Error) => setLookupError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [phone, api]);

  // Product search (debounced).
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: CatalogueHit[] }>(`/api/admin/billing/catalogue?q=${encodeURIComponent(query)}`)
        .then((r) => {
          setHits(r.items);
          setCursor(0);
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [query, api]);

  const addHit = useCallback((h: CatalogueHit) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === h.variantId && l.productId === h.productId);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { ...h, qty: 1, discountPercent: 0 }];
    });
    setQuery('');
    setHits([]);
    searchRef.current?.focus();
  }, []);

  const subtotal = lines.reduce((s, l) => s + lineGross(l), 0);
  const discount = lines.reduce((s, l) => s + lineDiscount(l), 0);
  const total = subtotal - discount;
  const gstIncluded = cfg?.gst.enabled && cfg.gst.rate > 0 ? total - Math.round(total / (1 + cfg.gst.rate / 100)) : 0;
  const maxDiscount = cfg?.settings.maxStaffDiscountPercent ?? 0;

  // With one payment method, it is the whole bill.
  const payments = useMemo(
    () => (methods.length === 1 ? [{ method: methods[0]!.method, amount: total, reference: methods[0]!.reference }] : methods.map((m) => ({ method: m.method, amount: Math.round(Number(m.amount || '0') * 100), reference: m.reference }))),
    [methods, total]
  );
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const overStock = lines.filter((l) => l.stockQty !== null && l.qty > l.stockQty);
  const problems = [
    phone.replace(/\D/g, '').length < 10 && 'Enter the customer’s mobile number',
    !name.trim() && 'Enter the customer’s name',
    lines.length === 0 && 'Add at least one item',
    overStock.length > 0 && `Only ${overStock[0]!.stockQty} of ${overStock[0]!.title} in stock`,
    paid !== total && `Payments add up to ${money(paid)}, the bill is ${money(total)}`,
  ].filter(Boolean) as string[];

  const complete = useCallback(async () => {
    if (problems.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<Done>('/api/admin/billing/sales', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: requestId,
          customer: { phone, name: name.trim(), ...(email.trim() && { email: email.trim() }) },
          lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, ...(l.discountPercent > 0 && { discountPercent: l.discountPercent }) })),
          payments: payments.map((p) => ({ method: p.method, amount: p.amount, ...(p.reference.trim() && { reference: p.reference.trim() }) })),
          sendWhatsApp: whatsappOk,
          consent: { transactional: whatsappOk ? 'opted_in' : 'opted_out', marketing: marketingOk },
        }),
      });
      setDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The bill could not be completed.');
    } finally {
      setBusy(false);
    }
  }, [api, busy, email, lines, marketingOk, name, payments, phone, problems.length, requestId, whatsappOk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void complete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [complete]);

  const reset = () => {
    setPhone('');
    setName('');
    setEmail('');
    setFound(null);
    setLines([]);
    setWhatsappOk(true);
    setMarketingOk(null);
    setMethods([{ method: cfg?.settings.paymentMethods[0] ?? 'cash', amount: '', reference: '' }]);
    setRequestId(newRequestId());
    setDone(null);
    setError(null);
  };

  const resend = async () => {
    if (!done) return;
    try {
      const r = await api<{ whatsapp: Done['whatsapp'] }>(`/api/admin/billing/invoices/${done.invoiceId}/whatsapp`, { method: 'POST', body: '{}' });
      setDone({ ...done, whatsapp: r.whatsapp });
    } catch (e) {
      setDone({ ...done, whatsapp: { status: 'failed', error: e instanceof Error ? e.message : 'Failed' } });
    }
  };

  if (done) {
    const wa = done.whatsapp.status;
    return (
      <div className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
        <section className={`${card} text-center`} aria-live="polite">
          <p className="font-display text-2xl font-bold text-ink">Sale completed</p>
          <ul className="mx-auto max-w-sm space-y-1.5 text-left text-sm">
            <li className="flex items-center gap-2 text-emerald-800">✓ Sale saved · {money(done.total)}</li>
            <li className={`flex items-center gap-2 ${done.pdf === 'ready' ? 'text-emerald-800' : 'text-alert'}`}>
              {done.pdf === 'ready' ? '✓' : '!'} Invoice {done.invoiceNo} {done.pdf === 'ready' ? 'generated' : '— PDF will be made when opened'}
            </li>
            <li className={`flex items-center gap-2 ${wa === 'sent' ? 'text-emerald-800' : wa === 'failed' ? 'text-alert' : 'text-ink/60'}`}>
              {wa === 'sent' ? '✓ WhatsApp invoice sent' : wa === 'failed' ? `! WhatsApp failed: ${done.whatsapp.error}` : wa === 'skipped' ? `– WhatsApp not sent${done.whatsapp.error ? `: ${done.whatsapp.error}` : ''}` : '– WhatsApp pending'}
            </li>
          </ul>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button type="button" className={primaryButton} onClick={() => void openPdf(done.invoiceId, 'print').catch((e: Error) => setError(e.message))}>
              Print invoice
            </button>
            <button type="button" className={button} onClick={() => void openPdf(done.invoiceId, 'download', done.invoiceNo).catch((e: Error) => setError(e.message))}>
              Download PDF
            </button>
            {wa !== 'sent' && (
              <button type="button" className={button} onClick={() => void resend()}>
                Send on WhatsApp
              </button>
            )}
            <Link href={`/admin/billing/invoices/${done.invoiceId}`} className={button}>
              View bill
            </Link>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="button" className={`${primaryButton} mt-2 w-full`} onClick={reset} autoFocus>
            New bill
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title="New bill" actions={<span className="hidden text-2xs text-ink/50 md:block">“/” search · ↑↓ Enter add · Ctrl+Enter complete</span>}>
        In-store sale. Uses the same products, prices and stock as the website; the bill is priced again on the server.
        {cfg?.whatsappMode === 'mock' && ' WhatsApp is in test mode here: messages are logged, not sent.'}
      </PageHeader>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* 1. Customer */}
          <section className={card} aria-labelledby="pos-customer">
            <h2 id="pos-customer" className={sectionTitle}>
              Customer
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-2xs font-semibold text-ink/60">Mobile number</span>
                <input className={input} inputMode="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
              </label>
              <label className="block space-y-1">
                <span className="text-2xs font-semibold text-ink/60">Name</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
              </label>
              <label className="block space-y-1">
                <span className="text-2xs font-semibold text-ink/60">Email (optional)</span>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>
            {lookupError && <p className="text-xs text-alert">{lookupError}</p>}
            {found && (
              <p className="text-xs text-ink/70">
                {found.customer ? (
                  <>
                    Returning customer · {found.customer.stats.onlineOrders} online order{found.customer.stats.onlineOrders === 1 ? '' : 's'}, {found.customer.stats.posPurchases} in store · spent {money(found.customer.stats.totalSpent)}
                  </>
                ) : found.account ? (
                  'Has a website account with this number — the bill will be linked to it.'
                ) : (
                  'New customer — saved with this bill. No website account needed.'
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={whatsappOk} onChange={(e) => setWhatsappOk(e.target.checked)} className="h-4 w-4 accent-[#14213D]" />
                Send the invoice on WhatsApp
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={marketingOk === 'opted_in' || (marketingOk === null && found?.customer?.consent.marketing.status === 'opted_in')}
                  onChange={(e) => setMarketingOk(e.target.checked ? 'opted_in' : 'opted_out')}
                  className="h-4 w-4 accent-[#14213D]"
                />
                Customer agreed to offers on WhatsApp
              </label>
            </div>
          </section>

          {/* 2. Products */}
          <section className={card} aria-labelledby="pos-items">
            <h2 id="pos-items" className={sectionTitle}>
              Items
            </h2>
            <div className="relative">
              <input
                ref={searchRef}
                className={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCursor((c) => Math.min(hits.length - 1, c + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (e.key === 'Enter' && hits[cursor]) {
                    e.preventDefault();
                    addHit(hits[cursor]!);
                  } else if (e.key === 'Escape') setQuery('');
                }}
                placeholder="Search product, size or SKU (press /)"
                aria-label="Search products"
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="pos-hits"
              />
              {hits.length > 0 && (
                <ul id="pos-hits" role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-paper shadow-lg">
                  {hits.map((h, i) => {
                    const out = h.stockQty !== null && h.stockQty <= 0;
                    return (
                      <li key={`${h.productId}/${h.variantId}`} role="option" aria-selected={i === cursor}>
                        <button
                          type="button"
                          disabled={out}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => addHit(h)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === cursor ? 'bg-tint' : ''} disabled:opacity-40`}
                        >
                          <span>
                            <span className="font-semibold text-ink">{h.title}</span>
                            <span className="block text-2xs text-ink/55">
                              {h.variantLabel} · {h.sku}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="font-semibold tabular-nums text-ink">{money(h.price)}</span>
                            <span className={`block text-2xs ${out ? 'text-alert' : 'text-ink/55'}`}>{h.stockQty === null ? 'Made to order' : out ? 'Out of stock' : `${h.stockQty} in stock`}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50">Search above to add items to the bill.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-ink/55">
                      <th className="py-2 pr-2">Item</th>
                      <th className="py-2 pr-2 text-right">Price</th>
                      <th className="py-2 pr-2 text-center">Qty</th>
                      <th className="py-2 pr-2 text-right">Discount %</th>
                      <th className="py-2 pr-2 text-right">Amount</th>
                      <th className="py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((l, i) => {
                      const over = l.stockQty !== null && l.qty > l.stockQty;
                      const set = (patch: Partial<Line>) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      return (
                        <tr key={`${l.productId}/${l.variantId}`}>
                          <td className="py-2 pr-2">
                            <span className="font-semibold text-ink">{l.title}</span>
                            <span className="block text-2xs text-ink/55">
                              {l.variantLabel} · {l.stockQty === null ? 'made to order' : `${l.stockQty} in stock`}
                            </span>
                            {over && <span className="block text-2xs font-semibold text-alert">Only {l.stockQty} in stock</span>}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{money(l.price)}</td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" aria-label={`One less ${l.title}`} className="h-8 w-8 rounded-lg border border-line" onClick={() => set({ qty: Math.max(1, l.qty - 1) })}>
                                −
                              </button>
                              <input aria-label={`Quantity of ${l.title}`} className="h-8 w-12 rounded-lg border border-line text-center tabular-nums" inputMode="numeric" value={l.qty} onChange={(e) => set({ qty: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
                              <button type="button" aria-label={`One more ${l.title}`} className="h-8 w-8 rounded-lg border border-line" onClick={() => set({ qty: Math.min(999, l.qty + 1) })}>
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <input
                              aria-label={`Discount percent on ${l.title}`}
                              className={`h-8 w-16 rounded-lg border text-right tabular-nums ${l.discountPercent > maxDiscount ? 'border-amber-500' : 'border-line'}`}
                              inputMode="decimal"
                              value={l.discountPercent || ''}
                              placeholder="0"
                              onChange={(e) => set({ discountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                            />
                          </td>
                          <td className="py-2 pr-2 text-right font-semibold tabular-nums">{money(lineGross(l) - lineDiscount(l))}</td>
                          <td className="py-2 text-right">
                            <button type="button" className="px-2 text-ink/50 hover:text-alert" aria-label={`Remove ${l.title}`} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lines.some((l) => l.discountPercent > maxDiscount) && <p className="pt-2 text-2xs text-amber-800">Discounts above {maxDiscount}% need a manager’s account; the bill will be refused otherwise.</p>}
              </div>
            )}
          </section>
        </div>

        {/* 3–4. Summary and payment */}
        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className={card} aria-labelledby="pos-summary">
            <h2 id="pos-summary" className={sectionTitle}>
              Bill
            </h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Subtotal ({lines.reduce((s, l) => s + l.qty, 0)} items)</dt>
                <dd className="tabular-nums">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Discount</dt>
                <dd className="tabular-nums">{discount ? `−${money(discount)}` : '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-display text-3xl font-bold tabular-nums text-ink">{money(total)}</dd>
              </div>
              {gstIncluded > 0 && <p className="text-right text-2xs text-ink/55">Includes GST {cfg?.gst.rate}%: {money(gstIncluded)}</p>}
            </dl>
          </section>

          <section className={card} aria-labelledby="pos-pay">
            <div className="flex items-center justify-between">
              <h2 id="pos-pay" className={sectionTitle}>
                Payment
              </h2>
              {methods.length === 1 ? (
                <button type="button" className="text-2xs font-semibold text-ink underline" onClick={() => setMethods((m) => [{ ...m[0]!, amount: (total / 100).toFixed(2) }, { method: cfg?.settings.paymentMethods.find((x) => x !== m[0]!.method) ?? 'upi', amount: '0', reference: '' }])}>
                  Split payment
                </button>
              ) : (
                <button type="button" className="text-2xs font-semibold text-ink underline" onClick={() => setMethods((m) => [{ ...m[0]!, amount: '' }])}>
                  One payment
                </button>
              )}
            </div>
            {methods.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Payment ${i + 1} method`}>
                  {(cfg?.settings.paymentMethods ?? ['cash']).map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={m.method === method}
                      onClick={() => setMethods((prev) => prev.map((x, j) => (j === i ? { ...x, method } : x)))}
                      className={`h-10 flex-1 rounded-xl border px-3 text-sm font-semibold ${m.method === method ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:border-ink/50'}`}
                    >
                      {METHOD_LABEL[method]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {methods.length > 1 && <input className={input} aria-label={`Amount paid by ${METHOD_LABEL[m.method]}`} inputMode="decimal" value={m.amount} onChange={(e) => setMethods((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="Amount ₹" />}
                  {m.method !== 'cash' && <input className={input} aria-label="Reference" value={m.reference} onChange={(e) => setMethods((prev) => prev.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} placeholder={m.method === 'upi' ? 'UPI ref (optional)' : 'Reference (optional)'} />}
                </div>
              </div>
            ))}
            {methods.length > 1 && (
              <p className={`text-2xs ${paid === total ? 'text-emerald-800' : 'text-alert'}`}>
                Paid {money(paid)} of {money(total)}
              </p>
            )}
          </section>

          {problems.length > 0 && lines.length > 0 && (
            <ul className="space-y-1 text-2xs text-ink/60">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
          <button type="button" className={`${primaryButton} h-14 w-full text-base`} disabled={problems.length > 0 || busy} onClick={() => void complete()}>
            {busy ? 'Completing…' : `Complete sale · ${money(total)}`}
          </button>
          {found?.customer && (
            <p className="text-center text-2xs text-ink/50">
              WhatsApp: <Badge value={found.customer.consent.transactional.status} /> · Offers: <Badge value={found.customer.consent.marketing.status} />
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
