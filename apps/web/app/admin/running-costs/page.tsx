'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RunningCosts } from '@bro-pics/shared';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';

type Costs = RunningCosts & { exportError?: string; checkedAt: string };

const card = 'space-y-3 rounded-2xl border border-line bg-paper p-5';
const sectionTitle = 'text-xs font-bold uppercase tracking-wider text-ink';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function money(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

const monthName = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

const dayLabel = (day: string) => String(Number(day.slice(8, 10)));
const dayName = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The steps the owner does once in the Google Cloud console. */
function SetupGuide({ costs }: { costs: Costs }) {
  const step = 'rounded-xl border border-line p-4 space-y-1.5';
  const done = (ok: boolean) => (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{ok ? 'Connected' : 'Not set up yet'}</span>
  );
  return (
    <section className={card} aria-labelledby="setup">
      <h2 id="setup" className={sectionTitle}>
        Connect Google&apos;s figures
      </h2>
      <p className="text-xs text-ink/70">
        Google doesn&apos;t let a website read its own bill directly, so the figures come from two Google features. Each is switched on once, in the Google Cloud
        console, by the account that owns the billing.
      </p>
      <div className={step}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">1. Monthly budget alerts — the month&apos;s total</h3>
          {done(costs.budgetConfigured)}
        </div>
        <p className="text-xs text-ink/70">
          Billing → <strong>Budgets &amp; alerts</strong> → Create budget. Projects: <strong>bropics-app</strong>. Amount: what you expect per month (e.g. ₹1,000). Under
          actions, tick <strong>Connect a Pub/Sub topic to this budget</strong> and create the topic <code className="rounded bg-field px-1">billing-budget-alerts</code>{' '}
          in bropics-app. Google then sends this month&apos;s total a few times a day, including what was spent before setup.
        </p>
      </div>
      <div className={step}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">2. Billing export — where the money goes, day by day</h3>
          {done(costs.exportConfigured && !costs.exportError)}
        </div>
        <p className="text-xs text-ink/70">
          Billing → <strong>Billing export</strong> → BigQuery export → <strong>Standard usage cost</strong> → Edit settings: project bropics-app, a new dataset named{' '}
          <code className="rounded bg-field px-1">billing_export</code>. Google starts filling it within a day; it only covers days from then on.
        </p>
        {costs.exportError && <p className="text-xs text-alert">The export is set but couldn&apos;t be read: {costs.exportError}</p>}
      </div>
      <p className="text-2xs text-ink/50">The technical half (the alert receiver, the export table setting and its read permission) is in the go-live checklist.</p>
    </section>
  );
}

export default function RunningCostsPage() {
  const api = useAdminApi();
  const [costs, setCosts] = useState<Costs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true);
      setError(null);
      try {
        setCosts(await api<Costs>(`/api/admin/running-costs${fresh ? '?fresh=1' : ''}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The running costs could not be loaded.');
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const c = costs;
  const lastMonth = c ? c.months.filter((m) => m.month < c.month).at(-1) ?? null : null;
  const maxService = c ? Math.max(0.01, ...c.byService.map((s) => s.amount)) : 1;
  const maxDay = c ? Math.max(0.01, ...c.daily.map((d) => d.amount)) : 1;
  const maxMonth = c ? Math.max(0.01, ...c.months.map((m) => m.amount)) : 1;
  const daysSoFar = c ? Number(new Date(c.checkedAt).toLocaleString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })) - 1 : 0;
  const nothingYet = c && !c.budgetConfigured && !c.exportConfigured;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-28 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Running costs</h1>
          <p className="text-xs text-ink/60">What Google charges to run the website: hosting, the database, photo storage and automatic updates. Google&apos;s own figures.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-field disabled:opacity-40">
          {loading ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-alert">
          {error}
        </p>
      )}

      {c && !nothingYet && (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Summary">
            <div className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink/60">This month so far</p>
              <p className="mt-1 font-display text-3xl font-bold text-ink">{money(c.monthToDate, c.currency)}</p>
              <p className="mt-1 text-2xs text-ink/55">{monthName(c.month)}{c.budget ? ` · Google's figure at ${when(c.budget.updatedAt)}` : ''}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink/60">Expected for the month</p>
              <p className="mt-1 font-display text-3xl font-bold text-ink">{money(c.forecast, c.currency)}</p>
              <p className="mt-1 text-2xs text-ink/55">{c.forecast === null ? 'Shown from the 2nd of the month' : `If the rest of the month is like the first ${daysSoFar} day${daysSoFar === 1 ? '' : 's'}`}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink/60">Last month</p>
              <p className="mt-1 font-display text-3xl font-bold text-ink">{money(lastMonth?.amount ?? null, c.currency)}</p>
              <p className="mt-1 text-2xs text-ink/55">{lastMonth ? monthName(lastMonth.month) : 'Not recorded yet'}</p>
            </div>
          </section>

          {c.budget && c.monthToDate !== null && c.budget.amount > 0 && (
            <section className={card} aria-labelledby="budget">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="budget" className={sectionTitle}>
                  Monthly budget
                </h2>
                <span className="text-xs text-ink/70">
                  {money(c.monthToDate, c.currency)} of {money(c.budget.amount, c.currency)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((c.monthToDate / c.budget.amount) * 100)}>
                <div
                  className={`h-full rounded-full ${c.monthToDate > c.budget.amount ? 'bg-alert' : c.monthToDate > 0.8 * c.budget.amount ? 'bg-amber-500' : 'bg-emerald-600'}`}
                  style={{ width: `${Math.min(100, (c.monthToDate / c.budget.amount) * 100)}%` }}
                />
              </div>
              <p className="text-2xs text-ink/55">Google emails the billing owner as the budget fills up. The budget is a warning, not a limit: the website keeps running.</p>
            </section>
          )}

          <section className={card} aria-labelledby="services">
            <h2 id="services" className={sectionTitle}>
              Where the money goes this month
            </h2>
            {c.byService.length === 0 ? (
              <p className="text-xs text-ink/60">The per-service detail appears once the billing export (step 2 below) has data.</p>
            ) : (
              <ul className="space-y-3">
                {c.byService.map((s) => (
                  <li key={s.service} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">
                        {s.label}
                        {s.purpose && <span className="ml-2 text-2xs font-normal text-ink/55">{s.purpose}</span>}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-ink">{money(s.amount, c.currency)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-field">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(1, (s.amount / maxService) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {c.byService.length > 0 && c.monthToDateSource === 'budget' && c.monthToDate !== null && (
              <p className="text-2xs text-ink/55">
                These add up to {money(c.byService.reduce((sum, s) => sum + s.amount, 0), c.currency)}
                {c.exportLatestDay ? ` (up to ${dayName(c.exportLatestDay)})` : ''}. The month total above is newer: Google&apos;s detail runs about a day behind it.
              </p>
            )}
          </section>

          {c.daily.length > 0 && (
            <section className={card} aria-labelledby="daily">
              <h2 id="daily" className={sectionTitle}>
                Day by day
              </h2>
              <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`Daily cost this month, highest ${money(maxDay, c.currency)}`}>
                {Array.from({ length: new Date(Date.UTC(Number(c.month.slice(0, 4)), Number(c.month.slice(5, 7)), 0)).getUTCDate() }, (_, i) => {
                  const day = `${c.month}-${String(i + 1).padStart(2, '0')}`;
                  const entry = c.daily.find((d) => d.day === day);
                  return (
                    <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={entry ? `${dayName(day)}: ${money(entry.amount, c.currency)}` : dayName(day)}>
                      <div className={`w-full rounded-t ${entry ? 'bg-ink/80' : 'bg-field'}`} style={{ height: entry ? `${Math.max(2, (entry.amount / maxDay) * 100)}%` : '3%' }} />
                      <span className={`text-[9px] ${i % 5 === 0 || i === 0 ? 'text-ink/50' : 'text-transparent'}`}>{i + 1}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-2xs text-ink/55">Highest day: {money(maxDay, c.currency)}. Hover a bar for its amount.</p>
              {c.exportLatestDay && <p className="text-2xs text-ink/55">Up to {dayName(c.exportLatestDay)}. Google adds each day&apos;s figures within about a day.</p>}
            </section>
          )}

          {c.months.length > 0 && (
            <section className={card} aria-labelledby="months">
              <h2 id="months" className={sectionTitle}>
                Month by month
              </h2>
              <ul className="space-y-2">
                {c.months.map((m) => (
                  <li key={m.month} className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-3">
                    <span className="text-xs text-ink/70">{monthName(m.month)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-field">
                      <div className={`h-full rounded-full ${m.month === c.month ? 'bg-gold' : 'bg-ink/70'}`} style={{ width: `${Math.max(1, (m.amount / maxMonth) * 100)}%` }} />
                    </div>
                    <span className="text-right text-xs font-semibold tabular-nums text-ink">
                      {money(m.amount, c.currency)}
                      {m.month === c.month && <span className="block text-[10px] font-normal text-ink/50">so far</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-2xs leading-relaxed text-ink/50">
            Figures are Google&apos;s, in your billing currency, after free-tier credits, and can be a few hours behind. The exact amount, with any taxes, is on Google&apos;s
            monthly invoice (Billing → Documents). Last checked {when(c.checkedAt)}.
          </p>
        </>
      )}

      {c && nothingYet && (
        <section className="rounded-2xl border border-dashed border-ink/30 bg-paper p-6 text-center">
          <p className="font-display text-lg font-bold text-ink">No cost figures yet</p>
          <p className="mx-auto mt-1 max-w-xl text-xs text-ink/65">
            Once the two Google settings below are switched on, this page shows this month&apos;s spend, the expected total, and what each part of the website costs.
            Until then the same figures are in the Google Cloud console under Billing → Reports.
          </p>
        </section>
      )}

      {c && (!c.budgetConfigured || !c.exportConfigured || c.exportError) && <SetupGuide costs={c} />}
    </div>
  );
}
