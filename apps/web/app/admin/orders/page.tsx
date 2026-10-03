'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { AdminModal } from '../../../components/admin/AdminModal';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Order, OrderStatus } from '@bro-pics/shared';

const STATUS_TABS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: 'all', label: 'All Orders' },
  { key: 'paid', label: 'Paid / Confirmed', status: 'paid' },
  { key: 'photo_validation', label: 'Photo Validation', status: 'photo_validation' },
  { key: 'print_rendering', label: 'Rendering', status: 'print_rendering' },
  { key: 'print_ready', label: 'Print Ready', status: 'print_ready' },
  { key: 'in_production', label: 'In Production', status: 'in_production' },
  { key: 'quality_check', label: 'QC Pending', status: 'quality_check' },
  { key: 'packed', label: 'Packed', status: 'packed' },
  { key: 'shipped', label: 'Shipped', status: 'shipped' },
  { key: 'delivered', label: 'Delivered', status: 'delivered' },
  { key: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { key: 'refunded', label: 'Refunded', status: 'refunded' },
];

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const d = new Date(dateVal as string | number | Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk Selection & Transition State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkTransitionModal, setShowBulkTransitionModal] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus>('in_production');
  const [bulkNote, setBulkNote] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Fetch Orders
  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const currentTab = STATUS_TABS.find((t) => t.key === activeTab);
      let url = '/api/admin/orders';
      const params = new URLSearchParams();

      if (currentTab?.status) {
        params.append('status', currentTab.status);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      setOrders(data.orders || []);
      setSelectedIds(new Set());
    } catch {
      showToast('Error loading orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user, activeTab]);

  // Handle Search Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  // Bulk Status Transition
  const handleBulkTransition = async () => {
    if (!user || selectedIds.size === 0) return;
    setIsBulkProcessing(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/bulk-transition', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          toStatus: bulkTargetStatus,
          note: bulkNote.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error('Bulk transition failed');
      const data = await res.json();
      const succeededCount = data.results?.filter((r: { ok: boolean }) => r.ok).length || 0;

      showToast(`Advanced ${succeededCount} of ${selectedIds.size} orders to ${bulkTargetStatus}`, 'success');
      setShowBulkTransitionModal(false);
      setBulkNote('');
      fetchOrders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to advance orders';
      showToast(msg, 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Download CSV Export
  const handleExportCSV = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('CSV Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      showToast('CSV export downloaded!', 'success');
    } catch {
      showToast('Failed to download CSV export', 'error');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Order Management & Fulfilment
          </h1>
          <p className="text-xs text-ink/60">
            Track order life-cycles from payment confirmation to print rendering, quality inspection, and courier shipment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/production"
            className="px-3.5 py-2 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            🏭 Production Queue ↗
          </Link>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>📥 Export CSV</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-line overflow-x-auto pb-px flex items-center gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-gold text-ink font-bold'
                : 'border-transparent text-ink/50 hover:text-ink hover:border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Bulk Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer phone or email..."
            className="w-full pl-8 pr-16 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="absolute right-1 top-1 bottom-1 px-3 bg-field hover:bg-tint rounded-lg text-2xs font-semibold text-ink transition-colors"
          >
            Search
          </button>
        </form>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-ink text-paper px-3 py-1.5 rounded-xl shadow-md animate-fadeIn text-xs">
            <span className="font-semibold">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={() => setShowBulkTransitionModal(true)}
              className="px-3 py-1 bg-gold hover:bg-gold-deep text-ink font-bold rounded-lg text-2xs transition-colors ml-2"
            >
              Advance Status
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-paper/60 hover:text-paper text-2xs ml-1"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-2">
            <span className="text-3xl block">📦</span>
            <p>No orders found matching the criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded text-gold focus:ring-gold"
                    />
                  </th>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Placed At (IST)</th>
                  <th className="p-3">Destination</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => {
                  const isSelected = selectedIds.has(o.id);
                  const address = o.addressJson as { city?: string; state?: string } | undefined;

                  return (
                    <tr
                      key={o.id}
                      className={`hover:bg-field/30 transition-colors ${
                        isSelected ? 'bg-gold/10' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(o.id)}
                          className="rounded text-gold focus:ring-gold"
                        />
                      </td>

                      <td className="p-3 font-mono font-bold text-ink">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="hover:text-gold hover:underline transition-colors"
                        >
                          #{o.orderNo}
                        </Link>
                      </td>

                      <td className="p-3 text-ink/70 font-mono text-2xs">
                        {formatISTDate(o.placedAt)}
                      </td>

                      <td className="p-3 text-ink">
                        {address?.city ? `${address.city}, ${address.state || ''}` : '—'}
                      </td>

                      <td className="p-3 font-bold text-ink">
                        ₹{o.total}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              o.paymentStatus === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.paymentStatus === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {o.paymentStatus}
                          </span>
                          <span className="text-2xs text-ink/50 capitalize font-mono">
                            {o.paymentMode === 'partial_cod' ? 'COD' : 'Online'}
                          </span>
                        </div>
                      </td>

                      <td className="p-3">
                        <StatusChip status={o.status} />
                      </td>

                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors inline-block"
                        >
                          View Details ↗
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Transition Modal */}
      <AdminModal
        isOpen={showBulkTransitionModal}
        onClose={() => setShowBulkTransitionModal(false)}
        title={`Advance ${selectedIds.size} Orders`}
      >
        <div className="space-y-4">
          <FormField label="Move to Status" required>
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value as OrderStatus)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            >
              <option value="photo_validation">Photo Validation</option>
              <option value="print_rendering">Print Rendering</option>
              <option value="print_ready">Print Ready</option>
              <option value="in_production">In Production</option>
              <option value="quality_check">Quality Check</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FormField>

          <FormField label="Internal Note / Reason">
            <input
              type="text"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="e.g. Batch print job dispatched to Station 4"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowBulkTransitionModal(false)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkTransition}
              disabled={isBulkProcessing}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isBulkProcessing ? 'Advancing Orders...' : 'Apply Transition'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
