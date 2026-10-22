'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isValidRole, type Role } from '@bro-pics/shared';
import { useAuth } from '../../lib/auth-context';
import { formatPaise } from '../../lib/format-price';
import { visibleModules } from '../../lib/admin-modules';
import { AdminNavIcon } from '../../components/admin/AdminShell';

interface DashboardData {
  today: { grossRevenue: number; netRevenue: number; orderCount: number; aov: number; refundCount: number; refundTotal: number; date: string };
  stuckPendingPayment: { count: number; orderIds: string[] };
  photoValidation: { count: number; orderIds: string[] };
  renderQueue: { queued: number; failed: number };
  productionStatusCounts: Record<string, number>;
  returns: { openCount: number; openReturnIds: string[] };
  refunds: { pendingCount: number; pendingAmount: number; failedCount: number; failedAmount: number };
  reviews: { pendingCount: number };
  operationalAlerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; count: number; link?: string; code?: string; type?: string }>;
}

// Where each kind of alert leads. The dashboard API sends no link of its own (an alert without one used to crash the page).
const ALERT_LINKS: Record<string, string> = {
  render_failure: '/admin/production',
  refund_failure: '/admin/returns',
  pending_refunds: '/admin/returns',
  rework: '/admin/production?status=rework',
  photo_validation: '/admin/orders?status=photo_validation',
  stuck_payment: '/admin/orders?status=pending_payment',
  returns: '/admin/returns',
  pending_reviews: '/admin/reviews',
};

const IN_WORK = ['photo_validation', 'print_rendering', 'print_ready', 'in_production', 'quality_check', 'rework', 'packed'];

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** What needs doing in a module right now, from the dashboard numbers (null = nothing to report). */
function moduleStatus(id: string, d: DashboardData | null): { text: string; urgent: boolean } | null {
  if (!d) return null;
  const c = d.productionStatusCounts ?? {};
  if (id === 'orders') {
    const working = IN_WORK.reduce((n, k) => n + (c[k] ?? 0), 0);
    const parts = [working ? `${working} in work` : null, d.photoValidation.count ? `${d.photoValidation.count} photo checks` : null, d.returns.openCount ? `${d.returns.openCount} returns` : null].filter(Boolean);
    return parts.length ? { text: parts.join(' · '), urgent: d.photoValidation.count > 0 || d.returns.openCount > 0 } : { text: 'No orders waiting', urgent: false };
  }
  if (id === 'marketing' && d.reviews.pendingCount) return { text: `${d.reviews.pendingCount} reviews to approve`, urgent: true };
  if (id === 'delivery' && (c.packed ?? 0) > 0) return { text: `${c.packed} packed, ready to ship`, urgent: true };
  return null;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdTokenResult();
      const r = token.claims.role;
      setRole(isValidRole(r) ? r : token.claims.staff ? 'staff' : null);
      const res = await fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token.token}` } });
      // Staff without the reports permission still get the module cards, just no numbers.
      if (res.ok) setData(await res.json());
      else if (res.status !== 403) throw new Error(`The numbers could not be loaded (HTTP ${res.status}).`);
    } catch (err: unknown) {
      setError((err as Error).message || 'The numbers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const modules = role ? visibleModules(role) : [];
  const today = data?.today;
  const working = data ? IN_WORK.reduce((n, k) => n + (data.productionStatusCounts?.[k] ?? 0), 0) : null;
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">KarthysGallery Admin</h1>
          <p className="mt-1 text-sm text-ink/60">
            {greeting()} · {dateLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-start sm:self-auto rounded-lg border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-tint disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      {data && (
        <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Today's sales", value: formatPaise(today?.netRevenue ?? 0), note: today?.refundTotal ? `after ${formatPaise(today.refundTotal)} refunds` : 'paid orders, after refunds' },
            { label: "Today's orders", value: String(today?.orderCount ?? 0), note: today?.orderCount ? `average ${formatPaise(today.aov)}` : 'paid orders today' },
            { label: 'Orders in work', value: String(working ?? 0), note: 'from photo check to packed', href: '/admin/production' },
            { label: 'Photo checks', value: String(data.photoValidation.count), note: 'low-quality photos to review', href: '/admin/orders/photo-validation', urgent: data.photoValidation.count > 0 },
          ].map((k) => {
            const body = (
              <>
                <p className="text-xs font-medium text-ink/60">{k.label}</p>
                <p className={`mt-1 font-display text-2xl font-bold tracking-tight ${'urgent' in k && k.urgent ? 'text-amber-700' : 'text-ink'}`}>{k.value}</p>
                <p className="mt-0.5 text-2xs text-ink/50">{k.note}</p>
              </>
            );
            return 'href' in k && k.href ? (
              <Link key={k.label} href={k.href} className="rounded-xl border border-line bg-paper p-4 hover:border-ink/40">
                {body}
              </Link>
            ) : (
              <div key={k.label} className="rounded-xl border border-line bg-paper p-4">
                {body}
              </div>
            );
          })}
        </section>
      )}

      {data && data.operationalAlerts.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2">
          <h2 className="text-sm font-bold text-ink">Needs attention</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {data.operationalAlerts.map((a, i) => (
              <li key={i}>
                <Link href={a.link ?? ALERT_LINKS[a.type ?? ''] ?? '/admin/orders'} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-tint">
                  <span className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${a.severity === 'critical' ? 'bg-red-600' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} aria-hidden="true" />
                    <span className="font-medium text-ink">{a.title}</span>
                    <span className="rounded-md bg-field px-1.5 text-xs font-bold text-ink">{a.count}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gold-deep">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Modules" className="space-y-3">
        <h2 className="text-sm font-bold text-ink">Modules</h2>
        {!role && loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-paper" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => {
              const status = moduleStatus(m.id, data);
              return (
                <div key={m.id} className="group relative flex flex-col rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-ink/40">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-gold">
                      <AdminNavIcon name={m.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-ink">
                        {/* The whole card opens the module; the quick links below stay separately clickable. */}
                        <Link href={m.pages[0].href} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
                          {m.title}
                        </Link>
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink/60">{m.description}</p>
                    </div>
                  </div>
                  {status && (
                    <p className={`mt-3 text-xs font-semibold ${status.urgent ? 'text-amber-700' : 'text-ink/55'}`}>{status.text}</p>
                  )}
                  <div className="relative z-10 mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                    {m.pages.slice(0, 4).map((p) => (
                      <Link key={p.href} href={p.href} className="rounded-full border border-line bg-field px-2.5 py-1 text-2xs font-semibold text-ink/75 hover:border-ink/40 hover:text-ink">
                        {p.label}
                      </Link>
                    ))}
                    {m.pages.length > 4 && <span className="px-1 py-1 text-2xs text-ink/45">+{m.pages.length - 4} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
