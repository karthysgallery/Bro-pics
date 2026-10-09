'use client';

import { useEffect, useState } from 'react';
import type { BillingReport } from '@bro-pics/shared';
import { useAdminApi } from '../template-builder/use-admin-api';
import { METHOD_LABEL, Notice, Stat, card, money, sectionTitle, todayIST } from './ui';

/** Date range + billing report (shared by the in-store dashboard and Billing reports). */
export function ReportView({ channel, full }: { channel?: 'pos'; full: boolean }) {
  const api = useAdminApi();
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [report, setReport] = useState<BillingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    api<{ report: BillingReport }>(`/api/admin/billing/reports?from=${from}&to=${to}${channel ? `&channel=${channel}` : ''}`)
      .then((r) => setReport(r.report))
      .catch((e: Error) => setError(e.message));
  }, [api, from, to, channel]);
  const preset = (days: number) => {
    const end = todayIST();
    const start = new Date(new Date(`${end}T00:00:00+05:30`).getTime() - (days - 1) * 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
    setFrom(start);
    setTo(end);
  };
  const r = report;
  const pay = (m: string) => r?.byPayment.find((p) => p.method === m)?.amount ?? 0;
  const maxDay = Math.max(1, ...(r?.byDay.map((d) => d.sales) ?? [1]));
  const sel = 'h-9 rounded-xl border border-line bg-paper px-2 text-sm text-ink';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" aria-label="Date range">
        <button type="button" className={sel} onClick={() => preset(1)}>Today</button>
        <button type="button" className={sel} onClick={() => preset(7)}>Last 7 days</button>
        <button type="button" className={sel} onClick={() => preset(30)}>Last 30 days</button>
        <input type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-xs text-ink/50">to</span>
        <input type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={from === to && from === todayIST() ? "Today's sales" : 'Sales'} value={money(r.sales)} />
            <Stat label="Bills" value={String(r.bills)} />
            <Stat label="Discounts given" value={money(r.discounts)} />
            <Stat label="Returns / refunds" value={money(r.refunds)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {channel === 'pos' ? (
              <>
                <Stat label="Cash" value={money(pay('cash'))} hint="after cash refunds" />
                <Stat label="UPI" value={money(pay('upi'))} />
                <Stat label="Card" value={money(pay('card'))} />
              </>
            ) : (
              <>
                <Stat label="Online" value={money(r.byChannel.online.sales)} hint={`${r.byChannel.online.bills} orders`} />
                <Stat label="In store" value={money(r.byChannel.pos.sales)} hint={`${r.byChannel.pos.bills} bills`} />
                <Stat label="Average bill" value={money(r.bills ? Math.round(r.sales / r.bills) : 0)} />
              </>
            )}
            <Stat label="Net sales" value={money(r.net)} hint="sales minus returns" />
          </div>
          {full && r.byDay.length > 0 && (
            <section className={card}>
              <h2 className={sectionTitle}>Sales by date</h2>
              <div className="flex h-36 items-end gap-1" role="img" aria-label="Sales per day">
                {r.byDay.map((d) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${money(d.sales)} · ${d.bills} bills${d.refunds ? ` · returns ${money(d.refunds)}` : ''}`}>
                    <div className="w-full rounded-t bg-ink/80" style={{ height: `${Math.max(2, (d.sales / maxDay) * 100)}%` }} />
                    <span className="text-[9px] text-ink/50">{Number(d.day.slice(8))}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            <section className={card}>
              <h2 className={sectionTitle}>Top products</h2>
              <ol className="space-y-1.5 text-sm">
                {r.byProduct.slice(0, full ? 15 : 5).map((p) => (
                  <li key={p.productId} className="flex justify-between gap-2">
                    <span className="truncate">{p.title} <span className="text-2xs text-ink/55">× {p.qty}</span></span>
                    <span className="tabular-nums">{money(p.revenue)}</span>
                  </li>
                ))}
                {r.byProduct.length === 0 && <li className="text-xs text-ink/50">No sales in this period.</li>}
              </ol>
            </section>
            <section className={card}>
              <h2 className={sectionTitle}>{full ? 'By category' : 'Payment methods'}</h2>
              <ul className="space-y-1.5 text-sm">
                {full
                  ? r.byCategory.map((c) => (
                      <li key={c.categoryId} className="flex justify-between gap-2"><span>{c.name} <span className="text-2xs text-ink/55">× {c.qty}</span></span><span className="tabular-nums">{money(c.revenue)}</span></li>
                    ))
                  : r.byPayment.map((p) => (
                      <li key={p.method} className="flex justify-between"><span>{METHOD_LABEL[p.method] ?? p.method}</span><span className="tabular-nums">{money(p.amount)}</span></li>
                    ))}
              </ul>
            </section>
          </div>
          {full && (
            <section className={card}>
              <h2 className={sectionTitle}>Payment methods</h2>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {r.byPayment.map((p) => (
                  <li key={p.method} className="flex justify-between"><span>{METHOD_LABEL[p.method] ?? p.method}</span><span className="tabular-nums">{money(p.amount)}</span></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
