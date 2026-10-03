'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { formatPaise } from '../../lib/format-price';
import { StatusChip } from '../../components/admin/StatusChip';

interface DashboardData {
  today: {
    grossRevenue: number;
    netRevenue: number;
    orderCount: number;
    aov: number;
    refundCount: number;
    refundTotal: number;
    date: string;
  };
  stuckPendingPayment: {
    count: number;
    orderIds: string[];
  };
  photoValidation: {
    count: number;
    orderIds: string[];
  };
  renderQueue: {
    queued: number;
    failed: number;
  };
  productionStatusCounts: Record<string, number>;
  returns: {
    openCount: number;
    openReturnIds: string[];
  };
  refunds: {
    pendingCount: number;
    pendingAmount: number;
    failedCount: number;
    failedAmount: number;
  };
  reviews: {
    pendingCount: number;
  };
  operationalAlerts: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    count: number;
    link: string;
    code: string;
  }>;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load dashboard metrics (HTTP ${res.status})`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Could not fetch live dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [user]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-tint rounded-xl animate-pulse" />
          <div className="h-8 w-24 bg-tint rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-paper border border-line p-5 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-paper border border-line p-6 animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <h2 className="text-base font-bold text-red-900 mb-1">Dashboard Error</h2>
        <p className="text-xs text-red-700 mb-4">{error}</p>
        <button
          type="button"
          onClick={fetchDashboard}
          className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-semibold hover:bg-ink/80 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const today = data?.today || {
    grossRevenue: 0,
    netRevenue: 0,
    orderCount: 0,
    aov: 0,
    refundCount: 0,
    refundTotal: 0,
    date: new Date().toISOString().slice(0, 10),
  };

  const productionCounts = data?.productionStatusCounts || {};

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Operations Dashboard</h1>
          <p className="text-xs text-ink/60 mt-0.5">
            Real-time fulfillment, revenue and production queues for {today.date} (IST)
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDashboard}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl border border-line bg-paper text-xs font-medium text-ink hover:bg-tint transition-colors flex items-center gap-1.5"
        >
          <span>{loading ? 'Refreshing…' : '↻ Refresh'}</span>
        </button>
      </div>

      {/* Operational Alerts */}
      {data?.operationalAlerts && data.operationalAlerts.length > 0 && (
        <div className="space-y-2">
          {data.operationalAlerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-xs ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : alert.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold">
                  {alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span className="font-semibold">{alert.title}</span>
                <span className="px-2 py-0.5 rounded-full bg-paper font-bold text-2xs shadow-xs">
                  {alert.count}
                </span>
              </div>
              <Link
                href={alert.link}
                className="font-semibold underline hover:opacity-80 transition-opacity"
              >
                Inspect Queue →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-paper border border-line p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink/60 mb-2">
            <span>Today's Net Revenue</span>
            <span className="text-emerald-600 font-bold">IST</span>
          </div>
          <div className="text-2xl font-bold font-display text-ink">
            {formatPaise(today.netRevenue)}
          </div>
          <div className="text-2xs text-ink/40 mt-1">
            Gross: {formatPaise(today.grossRevenue)} {today.refundTotal > 0 && `(−${formatPaise(today.refundTotal)} refunds)`}
          </div>
        </div>

        <div className="rounded-2xl bg-paper border border-line p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink/60 mb-2">
            <span>Today's Orders</span>
            <span className="text-gold font-bold">📦</span>
          </div>
          <div className="text-2xl font-bold font-display text-ink">{today.orderCount}</div>
          <div className="text-2xs text-ink/40 mt-1">Paid customer orders today</div>
        </div>

        <div className="rounded-2xl bg-paper border border-line p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink/60 mb-2">
            <span>Average Order Value</span>
            <span className="text-blue-600 font-bold">AOV</span>
          </div>
          <div className="text-2xl font-bold font-display text-ink">{formatPaise(today.aov)}</div>
          <div className="text-2xs text-ink/40 mt-1">Net revenue per paid order</div>
        </div>

        <div className="rounded-2xl bg-paper border border-line p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink/60 mb-2">
            <span>Pending Validation</span>
            <span className="text-amber-600 font-bold">DPI</span>
          </div>
          <div className="text-2xl font-bold font-display text-amber-700">
            {data?.photoValidation.count ?? 0}
          </div>
          <Link
            href="/admin/orders?status=photo_validation"
            className="text-2xs text-gold-deep font-semibold hover:underline mt-1"
          >
            Review low-DPI photos →
          </Link>
        </div>
      </div>

      {/* Production Pipeline Stations */}
      <div className="rounded-2xl bg-paper border border-line p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">Production Pipeline Stations</h2>
          <Link
            href="/admin/production"
            className="text-xs font-semibold text-gold hover:underline"
          >
            Open Production Queue →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { key: 'photo_validation', label: 'Photo Review', count: productionCounts.photo_validation ?? 0, href: '/admin/orders?status=photo_validation' },
            { key: 'print_rendering', label: 'Rendering', count: productionCounts.print_rendering ?? 0, href: '/admin/production?status=print_rendering' },
            { key: 'print_ready', label: 'Print Ready', count: productionCounts.print_ready ?? 0, href: '/admin/production?status=print_ready' },
            { key: 'in_production', label: 'In Production', count: productionCounts.in_production ?? 0, href: '/admin/production?status=in_production' },
            { key: 'quality_check', label: 'QC Pending', count: productionCounts.quality_check ?? 0, href: '/admin/production?status=quality_check' },
            { key: 'packed', label: 'Packed', count: productionCounts.packed ?? 0, href: '/admin/production?status=packed' },
            { key: 'shipped', label: 'Shipped', count: productionCounts.shipped ?? 0, href: '/admin/orders?status=shipped' },
          ].map((station) => (
            <Link
              key={station.key}
              href={station.href}
              className="p-3.5 rounded-xl bg-field border border-line hover:border-gold/60 hover:bg-gold/5 transition-all text-center flex flex-col justify-between group"
            >
              <span className="text-2xs font-semibold text-ink/60 group-hover:text-ink truncate">
                {station.label}
              </span>
              <span className="text-xl font-bold font-display text-ink my-1">
                {station.count}
              </span>
              <span className="text-3xs text-gold font-medium">View queue</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Operational Queues & Side States */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/returns"
          className="rounded-2xl bg-paper border border-line p-5 hover:border-gold/60 transition-all flex flex-col justify-between shadow-xs group"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-ink mb-1">
              <span>Open Returns & Claims</span>
              <span className="text-sm">↩️</span>
            </div>
            <p className="text-2xs text-ink/60">Damaged items and customer return requests</p>
          </div>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-2xl font-bold font-display text-ink">
              {data?.returns.openCount ?? 0}
            </span>
            <span className="text-xs text-gold font-semibold group-hover:underline">Process →</span>
          </div>
        </Link>

        <Link
          href="/admin/reviews"
          className="rounded-2xl bg-paper border border-line p-5 hover:border-gold/60 transition-all flex flex-col justify-between shadow-xs group"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-ink mb-1">
              <span>Pending Reviews</span>
              <span className="text-sm">⭐</span>
            </div>
            <p className="text-2xs text-ink/60">Customer photo ratings awaiting moderation</p>
          </div>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-2xl font-bold font-display text-ink">
              {data?.reviews.pendingCount ?? 0}
            </span>
            <span className="text-xs text-gold font-semibold group-hover:underline">Moderate →</span>
          </div>
        </Link>

        <Link
          href="/admin/analytics"
          className="rounded-2xl bg-paper border border-line p-5 hover:border-gold/60 transition-all flex flex-col justify-between shadow-xs group"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-ink mb-1">
              <span>Analytics & Reports</span>
              <span className="text-sm">📈</span>
            </div>
            <p className="text-2xs text-ink/60">Sales, product, marketing and funnel reports</p>
          </div>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-xs font-bold text-ink">7 Domains</span>
            <span className="text-xs text-gold font-semibold group-hover:underline">Explore →</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
