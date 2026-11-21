'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { formatPaise } from '../../../lib/format-price';

/*
 * Sales & analytics, built only from the shop's real records (orders, refunds, print jobs, returns). Every amount
 * the server sends is in paise. Test payments (the mock provider) are left out by the server and their count shown.
 */

type Tab = 'sales' | 'products' | 'customers' | 'coupons' | 'operations';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'products', label: 'Products' },
  { id: 'customers', label: 'Customers' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'operations', label: 'Orders & production' },
];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** The India calendar day, `days` before today, as YYYY-MM-DD (the server reads ranges as IST days). */
function istDay(daysAgo = 0): string {
  return new Date(Date.now() + IST_OFFSET_MS - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
function istMonthStart(): string {
  return `${istDay().slice(0, 7)}-01`;
}

const PRESETS: { id: string; label: string; from: () => string }[] = [
  { id: 'today', label: 'Today', from: () => istDay(0) },
  { id: '7', label: '7 days', from: () => istDay(6) },
  { id: '30', label: '30 days', from: () => istDay(29) },
  { id: 'month', label: 'This month', from: istMonthStart },
  { id: '90', label: '90 days', from: () => istDay(89) },
];

interface SalesData {
  grossRevenue: number;
  netRevenue: number;
  totalDiscounts: number;
  totalShipping: number;
  totalTax: number;
  totalRefunds: number;
  orderCount: number;
  paidOrderCount: number;
  cancelledOrderCount: number;
  aov: number;
  paymentModes: { prepaid: { count: number; revenue: number }; partialCod: { count: number; revenue: number } };
  dailyTrend: { date: string; gross: number; net: number; orders: number }[];
}
interface ProductsData {
  totalUnitsSold: number;
  totalProductsWithSales: number;
  topProducts: { productId: string; title: string; unitsSold: number; revenue: number }[];
}
interface CustomersData {
  uniqueCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  repeatCustomerRate: number;
  topCustomers: { userId: string; name: string | null; orderCount: number; totalSpent: number }[];
}
interface CouponsData {
  totalOrdersWithCoupon: number;
  couponPenetrationRate: number;
  totalCouponDiscount: number;
  coupons: { code: string; orderCount: number; totalDiscount: number; attributedRevenue: number }[];
}
interface FunnelData {
  ordersInitiated: number;
  ordersPaid: number;
  ordersCancelled: number;
  ordersStuckPending: number;
  conversionRate: number;
}
interface OperationsData {
  returnsCount: number;
  returnsRate: number;
  reasonsBreakdown: Record<string, number>;
  printJobs: { total: number; done: number; failed: number; queued: number };
  qcMetrics: { packedCount: number; reworkCount: number };
}
interface PersonalizationData {
  totalCustomizations: number;
  textPersonalizationCount: number;
  dpiDistribution: { green: number; amber: number; red: number };
}

interface Loaded {
  sales?: SalesData;
  products?: ProductsData;
  customers?: CustomersData;
  coupons?: CouponsData;
  funnel?: FunnelData;
  operations?: OperationsData;
  personalization?: PersonalizationData;
  testOrdersExcluded: number;
}

const DOMAINS_FOR_TAB: Record<Tab, string[]> = {
  sales: ['sales'],
  products: ['products'],
  customers: ['customers'],
  coupons: ['marketing'],
  operations: ['funnel', 'operations', 'personalization'],
};

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ---------- small building blocks ---------- */

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-paper p-4 sm:p-5">
      <p className="text-xs text-ink/60">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold text-ink tabular-nums sm:text-[1.7rem]">{value}</p>
      {note && <p className="mt-1 text-xs text-ink/55">{note}</p>}
    </div>
  );
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-paper p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {note && <p className="text-xs text-ink/50">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-field px-4 py-6 text-center text-sm text-ink/60">{children}</p>;
}

/** A labelled row with a share bar (one hue, so no legend is needed). */
function ShareRow({ label, value, share, href }: { label: string; value: string; share: number; href?: string }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        {href ? (
          <Link href={href} className="min-w-0 truncate text-ink hover:text-gold-deep hover:underline">{label}</Link>
        ) : (
          <span className="min-w-0 truncate text-ink">{label}</span>
        )}
        <span className="shrink-0 font-semibold text-ink tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-field">
        <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </div>
    </li>
  );
}

/** Revenue per day: thin single-hue bars from a zero baseline, a tooltip per bar, and a table view for screen readers. */
function DailyRevenueChart({ days }: { days: SalesData['dailyTrend'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.net), 1);
  const active = hover !== null ? days[hover] : null;
  return (
    <div>
      <div className="mb-2 h-5 text-xs text-ink/70" aria-live="polite">
        {active ? (
          <span>
            <strong className="text-ink">{formatDay(active.date)}</strong> · {formatPaise(active.net)} from {active.orders} paid order{active.orders === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-ink/45">Point at a bar to see that day</span>
        )}
      </div>
      <div className="relative h-44 border-b border-line" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line/70" />
        <span className="absolute -top-2 right-0 bg-paper pl-1 text-[11px] text-ink/45">{formatPaise(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] pt-3">
          {days.map((d, i) => (
            <div
              key={d.date}
              className="flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-gold-deep' : 'bg-gold'}`}
                style={{ height: `${d.net > 0 ? Math.max(3, (d.net / max) * 100) : 0}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink/45" aria-hidden="true">
        <span>{formatDay(days[0].date)}</span>
        {days.length > 1 && <span>{formatDay(days[days.length - 1].date)}</span>}
      </div>
      <details className="mt-3 text-xs text-ink/70">
        <summary className="cursor-pointer select-none text-ink/60 hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-ink/50">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Paid orders</th>
              <th className="py-1 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr key={d.date}>
                <td className="py-1">{formatDay(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.orders}</td>
                <td className="py-1 text-right tabular-nums">{formatPaise(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Fills the calendar between the range ends so days without sales show as gaps, not as missing bars. */
function fillDays(trend: SalesData['dailyTrend'], from: string, to: string): SalesData['dailyTrend'] {
  const byDay = new Map(trend.map((d) => [d.date, d]));
  const out: SalesData['dailyTrend'] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { date: day, gross: 0, net: 0, orders: 0 });
  }
  return out;
}

const RETURN_REASONS: Record<string, string> = {
  damaged: 'Arrived damaged',
  wrong_item: 'Wrong item',
  print_quality: 'Print quality',
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  other: 'Other',
};

/* ---------- page ---------- */

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('sales');
  const [preset, setPreset] = useState<string>('30');
  const [from, setFrom] = useState(() => istDay(29));
  const [to, setTo] = useState(() => istDay(0));
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const results = await Promise.all(
        DOMAINS_FOR_TAB[tab].map(async (domain) => {
          const res = await fetch(`/api/admin/analytics/${domain}?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see reports.' : 'The report could not be loaded.');
          return [domain, (await res.json()) as { data: unknown; testOrdersExcluded?: number }] as const;
        })
      );
      const next: Loaded = { testOrdersExcluded: 0 };
      for (const [domain, body] of results) {
        next.testOrdersExcluded = Math.max(next.testOrdersExcluded, body.testOrdersExcluded ?? 0);
        const key = domain === 'marketing' ? 'coupons' : domain;
        (next as unknown as Record<string, unknown>)[key] = body.data;
      }
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be loaded.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, tab, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosePreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setFrom(p.from());
    setTo(istDay(0));
  };

  const rangeLabel = useMemo(() => (from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`), [from, to]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Sales & analytics</h1>
          <p className="mt-1 text-sm text-ink/60">
            Worked out from your real orders. Only paid orders count as sales; test payments are left out.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Report">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  tab === t.id ? 'bg-ink font-semibold text-paper' : 'text-ink/65 hover:bg-tint hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-line bg-paper p-0.5" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  aria-pressed={preset === p.id}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors ${
                    preset === p.id ? 'bg-gold font-semibold text-ink' : 'text-ink/65 hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink">
              <label className="sr-only" htmlFor="an-from">From</label>
              <input id="an-from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset(''); }} className="bg-transparent focus:outline-none" />
              <span className="text-ink/40">to</span>
              <label className="sr-only" htmlFor="an-to">To</label>
              <input id="an-to" type="date" value={to} min={from} max={istDay(0)} onChange={(e) => { setTo(e.target.value); setPreset(''); }} className="bg-transparent focus:outline-none" />
            </div>
          </div>
        </div>

        <p className="text-xs text-ink/50">
          {rangeLabel} (India time)
          {data && data.testOrdersExcluded > 0 && ` · ${data.testOrdersExcluded} test order${data.testOrdersExcluded === 1 ? '' : 's'} not counted`}
        </p>
      </header>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading || !data ? (
        <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-card bg-tint" />)}
          <div className="col-span-2 h-64 rounded-card bg-tint lg:col-span-4" />
        </div>
      ) : (
        <>
          {tab === 'sales' && data.sales && <SalesView s={data.sales} from={from} to={to} />}
          {tab === 'products' && data.products && <ProductsView p={data.products} />}
          {tab === 'customers' && data.customers && <CustomersView c={data.customers} />}
          {tab === 'coupons' && data.coupons && <CouponsView c={data.coupons} />}
          {tab === 'operations' && data.funnel && data.operations && data.personalization && (
            <OperationsView f={data.funnel} o={data.operations} p={data.personalization} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- tab views ---------- */

function SalesView({ s, from, to }: { s: SalesData; from: string; to: string }) {
  const days = fillDays(s.dailyTrend, from, to);
  const unpaid = s.orderCount - s.paidOrderCount - s.cancelledOrderCount;
  const totalModes = s.paymentModes.prepaid.revenue + s.paymentModes.partialCod.revenue || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={formatPaise(s.netRevenue)} note={s.totalRefunds > 0 ? `${formatPaise(s.grossRevenue)} paid − ${formatPaise(s.totalRefunds)} refunded` : 'Money received from paid orders'} />
        <Stat label="Paid orders" value={String(s.paidOrderCount)} note={`${s.orderCount} placed in this period`} />
        <Stat label="Average paid order" value={formatPaise(s.aov)} />
        <Stat label="Discounts given" value={formatPaise(s.totalDiscounts)} note="Coupons and offers on paid orders" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue by day" note="Paid orders, after refunds" className="lg:col-span-2">
          {s.paidOrderCount === 0 && s.totalRefunds === 0 ? <Empty>No paid orders in this period.</Empty> : <DailyRevenueChart days={days} />}
        </Panel>

        <Panel title="Where the orders stand">
          <dl className="divide-y divide-line text-sm">
            {[
              ['Paid', s.paidOrderCount],
              ['Not paid yet', Math.max(0, unpaid)],
              ['Cancelled', s.cancelledOrderCount],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-2.5">
                <dt className="text-ink/70">{k}</dt>
                <dd className="font-semibold text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/admin/orders" className="mt-3 inline-block text-xs font-semibold text-gold-deep hover:underline">Open orders</Link>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How customers paid">
          {s.paidOrderCount === 0 ? (
            <Empty>No paid orders in this period.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              <ShareRow label={`Paid in full online · ${s.paymentModes.prepaid.count} order${s.paymentModes.prepaid.count === 1 ? '' : 's'}`} value={formatPaise(s.paymentModes.prepaid.revenue)} share={s.paymentModes.prepaid.revenue / totalModes} />
              <ShareRow label={`Advance online, rest on delivery · ${s.paymentModes.partialCod.count}`} value={formatPaise(s.paymentModes.partialCod.revenue)} share={s.paymentModes.partialCod.revenue / totalModes} />
            </ul>
          )}
          <p className="mt-3 text-xs text-ink/50">Razorpay keeps the split by UPI, card and net banking in its own dashboard.</p>
        </Panel>

        <Panel title="What the revenue includes">
          <dl className="divide-y divide-line text-sm">
            {[
              ['Delivery charges collected', s.totalShipping],
              ['GST included in prices', s.totalTax],
              ['Refunded', s.totalRefunds],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-2.5">
                <dt className="text-ink/70">{k}</dt>
                <dd className="font-semibold text-ink tabular-nums">{formatPaise(v as number)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function ProductsView({ p }: { p: ProductsData }) {
  const top = p.topProducts[0]?.revenue || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Frames sold" value={String(p.totalUnitsSold)} note="In paid orders" />
        <Stat label="Products that sold" value={String(p.totalProductsWithSales)} />
      </div>
      <Panel title="Best-selling products" note="By value sold, before coupon discounts">
        {p.topProducts.length === 0 ? (
          <Empty>No paid orders in this period.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {p.topProducts.map((x) => (
              <ShareRow key={x.productId} label={`${x.title} · ${x.unitsSold} sold`} value={formatPaise(x.revenue)} share={x.revenue / top} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CustomersView({ c }: { c: CustomersData }) {
  const top = c.topCustomers[0]?.totalSpent || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers who paid" value={String(c.uniqueCustomers)} />
        <Stat label="First-time" value={String(c.newCustomers)} />
        <Stat label="Came back" value={String(c.repeatCustomers)} note="Ordered before, or more than once here" />
        <Stat label="Repeat rate" value={pct(c.repeatCustomerRate)} />
      </div>
      <Panel title="Top customers" note="By amount paid in this period">
        {c.topCustomers.length === 0 ? (
          <Empty>No paid orders in this period.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {c.topCustomers.map((x) => (
              <ShareRow
                key={x.userId}
                href={`/admin/customers/${x.userId}`}
                label={`${x.name || 'Customer'} · ${x.orderCount} order${x.orderCount === 1 ? '' : 's'}`}
                value={formatPaise(x.totalSpent)}
                share={x.totalSpent / top}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CouponsView({ c }: { c: CouponsData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders with a coupon" value={String(c.totalOrdersWithCoupon)} />
        <Stat label="Share of paid orders" value={pct(c.couponPenetrationRate)} />
        <Stat label="Coupon discounts" value={formatPaise(c.totalCouponDiscount)} />
      </div>
      <Panel title="Coupons used">
        {c.coupons.length === 0 ? (
          <Empty>No coupon was used on a paid order in this period.</Empty>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink/50">
                  <th className="px-1 py-2 font-medium">Code</th>
                  <th className="px-1 py-2 text-right font-medium">Orders</th>
                  <th className="px-1 py-2 text-right font-medium">Discount</th>
                  <th className="px-1 py-2 text-right font-medium">Order value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.coupons.map((x) => (
                  <tr key={x.code}>
                    <td className="px-1 py-2.5 font-semibold text-ink">{x.code}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{x.orderCount}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{formatPaise(x.totalDiscount)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{formatPaise(x.attributedRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function OperationsView({ f, o, p }: { f: FunnelData; o: OperationsData; p: PersonalizationData }) {
  const dpiTotal = p.dpiDistribution.green + p.dpiDistribution.amber + p.dpiDistribution.red || 1;
  const reasons = Object.entries(o.reasonsBreakdown).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders placed" value={String(f.ordersInitiated)} />
        <Stat label="Paid" value={String(f.ordersPaid)} note={f.ordersInitiated ? `${pct(f.conversionRate)} of orders placed` : undefined} />
        <Stat label="Unpaid after 30 min" value={String(f.ordersStuckPending)} note="Checkout started, no payment yet" />
        <Stat label="Returns" value={String(o.returnsCount)} note="All time" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Print files" note="All time">
          <dl className="divide-y divide-line text-sm">
            {[
              ['Ready', o.printJobs.done],
              ['Waiting or rendering', o.printJobs.queued],
              ['Failed', o.printJobs.failed],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-2.5">
                <dt className="text-ink/70">{k}</dt>
                <dd className="font-semibold text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/admin/production/jobs" className="mt-3 inline-block text-xs font-semibold text-gold-deep hover:underline">Open print jobs</Link>
        </Panel>

        <Panel title="Photo quality" note="All customer photos">
          {p.totalCustomizations === 0 ? (
            <Empty>No customer photos yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              <ShareRow label="Good for print" value={String(p.dpiDistribution.green)} share={p.dpiDistribution.green / dpiTotal} />
              <ShareRow label="Acceptable" value={String(p.dpiDistribution.amber)} share={p.dpiDistribution.amber / dpiTotal} />
              <ShareRow label="Too low, needs a check" value={String(p.dpiDistribution.red)} share={p.dpiDistribution.red / dpiTotal} />
            </ul>
          )}
        </Panel>

        <Panel title="Quality check" note="Orders in this period">
          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-ink/70">Passed and packed</dt>
              <dd className="font-semibold text-ink tabular-nums">{o.qcMetrics.packedCount}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-ink/70">Sent back for rework</dt>
              <dd className="font-semibold text-ink tabular-nums">{o.qcMetrics.reworkCount}</dd>
            </div>
          </dl>
          {reasons.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold text-ink/70">Why customers returned</p>
              <ul className="mt-1 space-y-1 text-sm text-ink/80">
                {reasons.map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span>{RETURN_REASONS[k] ?? k.replace(/_/g, ' ')}</span><span className="tabular-nums">{v}</span></li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
