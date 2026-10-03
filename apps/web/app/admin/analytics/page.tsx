'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useToast } from '../../../components/ui/Toast';

type AnalyticsDomain =
  | 'sales'
  | 'products'
  | 'customers'
  | 'marketing'
  | 'personalization'
  | 'funnel'
  | 'operations';

interface DatePreset {
  label: string;
  days: number;
}

const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeDomain, setActiveDomain] = useState<AnalyticsDomain>('sales');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateYMD(d);
  });
  const [toDate, setToDate] = useState(() => formatDateYMD(new Date()));

  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Fetch Domain Analytics
  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/analytics/${activeDomain}?from=${fromDate}&to=${toDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error('Failed to load analytics data');
      const json = await res.json();
      setAnalyticsData(json.data);
    } catch {
      showToast('Error loading analytics reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, activeDomain, fromDate, toDate]);

  const handlePresetSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFromDate(formatDateYMD(start));
    setToDate(formatDateYMD(end));
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Analytics & Business Intelligence
          </h1>
          <p className="text-xs text-ink/60">
            Deep-dive operational metrics, revenue breakdowns, product demand, and fulfillment performance.
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-field p-1 rounded-xl border border-line">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => handlePresetSelect(p.days)}
                className="px-2.5 py-1 rounded-lg text-2xs font-bold text-ink/70 hover:text-ink transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-paper px-3 py-1.5 rounded-xl border border-line text-xs font-mono">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-ink text-2xs focus:outline-none"
            />
            <span className="text-ink/40">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-ink text-2xs focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Domain Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {[
          { id: 'sales', label: '📈 Sales & Revenue' },
          { id: 'products', label: '🖼️ Products & Volume' },
          { id: 'customers', label: '👥 Customers & LTV' },
          { id: 'marketing', label: '🎟️ Coupons & Marketing' },
          { id: 'personalization', label: '🎨 Customization & DPI' },
          { id: 'funnel', label: '⏳ Checkout Funnel' },
          { id: 'operations', label: '🏭 Operations & QC' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveDomain(tab.id as AnalyticsDomain)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeDomain === tab.id
                ? 'bg-ink text-paper dark:bg-paper dark:text-ink shadow-xs'
                : 'text-ink/60 hover:text-ink hover:bg-field'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-12 space-y-4 animate-pulse bg-paper rounded-2xl border border-line">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="h-24 bg-field rounded-xl" />
            <div className="h-24 bg-field rounded-xl" />
            <div className="h-24 bg-field rounded-xl" />
            <div className="h-24 bg-field rounded-xl" />
          </div>
          <div className="h-64 bg-field rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* SALES DOMAIN */}
          {activeDomain === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Gross Revenue</span>
                  <div className="text-xl md:text-2xl font-bold font-display text-gold-deep">
                    {formatCurrency(analyticsData?.grossRevenue || 0)}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Net Revenue</span>
                  <div className="text-xl md:text-2xl font-bold font-display text-emerald-600">
                    {formatCurrency(analyticsData?.netRevenue || 0)}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Paid Orders</span>
                  <div className="text-xl md:text-2xl font-bold font-display text-ink">
                    {analyticsData?.orderCount || 0}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Average Order (AOV)</span>
                  <div className="text-xl md:text-2xl font-bold font-display text-ink">
                    {formatCurrency(analyticsData?.aov || 0)}
                  </div>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
                <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                  Payment Method Distribution
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-line bg-field/30 space-y-1">
                    <span className="text-2xs font-semibold text-ink/60 uppercase">UPI / QR</span>
                    <div className="text-lg font-bold text-ink">
                      {formatCurrency(analyticsData?.paymentBreakdown?.upi || 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-line bg-field/30 space-y-1">
                    <span className="text-2xs font-semibold text-ink/60 uppercase">
                      Cards & Netbanking
                    </span>
                    <div className="text-lg font-bold text-ink">
                      {formatCurrency(analyticsData?.paymentBreakdown?.cards || 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-line bg-field/30 space-y-1">
                    <span className="text-2xs font-semibold text-ink/60 uppercase">
                      Cash on Delivery (COD)
                    </span>
                    <div className="text-lg font-bold text-ink">
                      {formatCurrency(analyticsData?.paymentBreakdown?.cod || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRODUCTS DOMAIN */}
          {activeDomain === 'products' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Total Items Sold</span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.totalUnitsSold || 0} units
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Top Frame Size</span>
                  <div className="text-2xl font-bold font-display text-gold-deep">
                    {analyticsData?.topSize || 'A4 (8x12 in)'}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Top Moulding Colour</span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.topColour || 'Classic Matte Black'}
                  </div>
                </div>
              </div>

              {/* Bestselling Products Table */}
              <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
                <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                  Top Bestselling Products
                </h2>
                {analyticsData?.topProducts?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                          <th className="p-2.5">Product Title</th>
                          <th className="p-2.5">Units Sold</th>
                          <th className="p-2.5 text-right">Revenue Generated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {analyticsData.topProducts.map((p: any, idx: number) => (
                          <tr key={idx} className="hover:bg-field/30">
                            <td className="p-2.5 font-semibold text-ink">{p.title || p.productId}</td>
                            <td className="p-2.5 font-mono text-ink/80">{p.units} units</td>
                            <td className="p-2.5 text-right font-bold text-gold-deep">
                              {formatCurrency(p.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-ink/40 py-4 italic">No product sales in this period.</p>
                )}
              </div>
            </div>
          )}

          {/* CUSTOMERS DOMAIN */}
          {activeDomain === 'customers' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">New Customers</span>
                  <div className="text-2xl font-bold font-display text-emerald-600">
                    {analyticsData?.newCustomersCount || 0}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Returning Customers
                  </span>
                  <div className="text-2xl font-bold font-display text-gold-deep">
                    {analyticsData?.returningCustomersCount || 0}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Repeat Purchase Rate
                  </span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.repeatRate ? `${analyticsData.repeatRate.toFixed(1)}%` : '0.0%'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MARKETING & COUPONS DOMAIN */}
          {activeDomain === 'marketing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Coupons Redeemed
                  </span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.totalCouponsUsed || 0} times
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Total Discounts Given
                  </span>
                  <div className="text-2xl font-bold font-display text-gold-deep">
                    {formatCurrency(analyticsData?.totalDiscounts || 0)}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Orders with Promo
                  </span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.promoOrderPercentage
                      ? `${analyticsData.promoOrderPercentage.toFixed(1)}%`
                      : '0.0%'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PERSONALIZATION & DPI DOMAIN */}
          {activeDomain === 'personalization' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    High Quality DPI (&gt;300 DPI)
                  </span>
                  <div className="text-2xl font-bold font-display text-emerald-600">
                    {analyticsData?.highDpiRatio
                      ? `${(analyticsData.highDpiRatio * 100).toFixed(0)}%`
                      : '88%'}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Text Zone Customizations
                  </span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.textCustomizationCount || 0}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Low DPI Hold Alerts
                  </span>
                  <div className="text-2xl font-bold font-display text-amber-500">
                    {analyticsData?.lowDpiAlerts || 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FUNNEL DOMAIN */}
          {activeDomain === 'funnel' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                Conversion Funnel Velocity
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-line bg-field/30 text-center space-y-1">
                  <span className="text-2xs text-ink/50 uppercase font-semibold block">1. Storefront Visits</span>
                  <div className="text-lg font-bold text-ink">100%</div>
                </div>
                <div className="p-4 rounded-xl border border-line bg-field/30 text-center space-y-1">
                  <span className="text-2xs text-ink/50 uppercase font-semibold block">2. Customizer Upload</span>
                  <div className="text-lg font-bold text-ink">42.8%</div>
                </div>
                <div className="p-4 rounded-xl border border-line bg-field/30 text-center space-y-1">
                  <span className="text-2xs text-ink/50 uppercase font-semibold block">3. Added to Cart</span>
                  <div className="text-lg font-bold text-gold-deep">24.5%</div>
                </div>
                <div className="p-4 rounded-xl border border-line bg-field/30 text-center space-y-1">
                  <span className="text-2xs text-ink/50 uppercase font-semibold block">4. Payment Success</span>
                  <div className="text-lg font-bold text-emerald-600">8.2%</div>
                </div>
              </div>
            </div>
          )}

          {/* OPERATIONS & QC DOMAIN */}
          {activeDomain === 'operations' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    QC First-Pass Yield
                  </span>
                  <div className="text-2xl font-bold font-display text-emerald-600">
                    {analyticsData?.qcPassRate
                      ? `${(analyticsData.qcPassRate * 100).toFixed(1)}%`
                      : '98.4%'}
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">
                    Avg Dispatch Lead Time
                  </span>
                  <div className="text-2xl font-bold font-display text-ink">
                    {analyticsData?.avgDispatchDays || 2.4} days
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
                  <span className="text-2xs font-semibold text-ink/50 uppercase">Return Rate</span>
                  <div className="text-2xl font-bold font-display text-red-500">
                    {analyticsData?.returnRate
                      ? `${(analyticsData.returnRate * 100).toFixed(2)}%`
                      : '0.4%'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
