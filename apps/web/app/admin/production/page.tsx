'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { AdminModal } from '../../../components/admin/AdminModal';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Order, OrderStatus } from '@bro-pics/shared';

const PRODUCTION_STATIONS: { key: OrderStatus; label: string; icon: string; nextStatus?: OrderStatus }[] = [
  { key: 'paid', label: '1. Order Paid', icon: '💳', nextStatus: 'print_rendering' },
  { key: 'photo_validation', label: '2. Photo Check', icon: '🔍', nextStatus: 'print_rendering' },
  { key: 'print_rendering', label: '3. Rendering', icon: '⚙️', nextStatus: 'print_ready' },
  { key: 'print_ready', label: '4. Print Ready', icon: '🖨️', nextStatus: 'in_production' },
  { key: 'in_production', label: '5. Assembly / Framing', icon: '🔨', nextStatus: 'quality_check' },
  { key: 'quality_check', label: '6. QC Inspection', icon: '🛡️', nextStatus: 'packed' },
  { key: 'packed', label: '7. Packed & Ready', icon: '📦', nextStatus: 'shipped' },
  { key: 'shipped', label: '8. In Transit', icon: '🚚' },
];

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
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
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminProductionQueuePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeStation, setActiveStation] = useState<OrderStatus>('print_ready');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Advance Modal
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceTargetStatus, setAdvanceTargetStatus] = useState<OrderStatus>('in_production');
  const [advanceNote, setAdvanceNote] = useState('');

  // Fetch queue
  const fetchQueue = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders?status=${activeStation}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load station queue');
      const data = await res.json();
      setOrders(data.orders || []);
      setSelectedIds(new Set());
    } catch {
      showToast('Error loading production queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [user, activeStation]);

  const currentStationConfig = PRODUCTION_STATIONS.find((s) => s.key === activeStation);

  // Bulk Advance
  const handleBulkAdvance = async () => {
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
          toStatus: advanceTargetStatus,
          note: advanceNote.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error('Bulk advance failed');
      const data = await res.json();
      const succeededCount = data.results?.filter((r: { ok: boolean }) => r.ok).length || 0;

      showToast(`Advanced ${succeededCount} of ${selectedIds.size} orders to ${advanceTargetStatus}`, 'success');
      setShowAdvanceModal(false);
      setAdvanceNote('');
      fetchQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to advance';
      showToast(msg, 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Download Bulk ZIP (Print files & Job Sheet)
  const handleDownloadZip = async () => {
    if (!user || selectedIds.size === 0) return;
    if (selectedIds.size > 20) {
      showToast('Max 20 orders per print run batch', 'error');
      return;
    }

    setIsDownloadingZip(true);
    try {
      const token = await user.getIdToken();
      const idsParam = Array.from(selectedIds).join(',');
      const res = await fetch(`/api/admin/orders/bulk-print-files?orderIds=${encodeURIComponent(idsParam)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to generate ZIP');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `print-batch-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      showToast('Downloaded print batch ZIP with Job Sheet manifest!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      showToast(msg, 'error');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Select all / toggle
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

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Production & Assembly Workstations
          </h1>
          <p className="text-xs text-ink/60">
            Real-time shop floor queue for rendering 300 DPI print jobs, physical frame mounting, quality control, and dispatch packing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/production/qc"
            className="px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs"
          >
            🛡️ Launch QC Inspection Station →
          </Link>
        </div>
      </div>

      {/* Workstation Stepper / Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {PRODUCTION_STATIONS.map((station) => {
          const isActive = activeStation === station.key;
          return (
            <button
              key={station.key}
              type="button"
              onClick={() => setActiveStation(station.key)}
              className={`p-3 rounded-2xl border text-left transition-all ${
                isActive
                  ? 'border-gold bg-gold/10 shadow-xs ring-1 ring-gold/40'
                  : 'border-line bg-paper hover:bg-field text-ink/70'
              }`}
            >
              <span className="text-lg block mb-1">{station.icon}</span>
              <span className={`text-xs block font-bold truncate ${isActive ? 'text-ink' : 'text-ink/80'}`}>
                {station.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-line bg-field/40">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink flex items-center gap-2">
            <span>{currentStationConfig?.icon}</span>
            <span>{currentStationConfig?.label} Station</span>
            <span className="text-xs text-ink/50 font-mono">({orders.length} in queue)</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              {activeStation === 'print_ready' && (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isDownloadingZip}
                  className="px-3.5 py-1.5 rounded-xl bg-ink text-gold hover:bg-ink/80 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isDownloadingZip ? 'Generating ZIP...' : `📥 Download Batch ZIP (${selectedIds.size})`}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setAdvanceTargetStatus(currentStationConfig?.nextStatus || 'in_production');
                  setShowAdvanceModal(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs"
              >
                Advance Selected ({selectedIds.size}) →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Queue Table */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-2">
            <span className="text-3xl block">✨</span>
            <p>Station queue is currently clear! No orders pending at {currentStationConfig?.label}.</p>
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
                  <th className="p-3">Age / Placed</th>
                  <th className="p-3">Destination</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Current Status</th>
                  <th className="p-3 text-right">Job Sheet Action</th>
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

                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            o.deliveryMethod === 'express'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-field text-ink/70'
                          }`}
                        >
                          {o.deliveryMethod || 'standard'}
                        </span>
                      </td>

                      <td className="p-3">
                        <StatusChip status={o.status} />
                      </td>

                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors inline-block"
                        >
                          Inspect Job Sheet ↗
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

      {/* Advance Modal */}
      <AdminModal
        isOpen={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        title={`Advance ${selectedIds.size} Orders to Next Station`}
      >
        <div className="space-y-4">
          <FormField label="Move to Status" required>
            <select
              value={advanceTargetStatus}
              onChange={(e) => setAdvanceTargetStatus(e.target.value as OrderStatus)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            >
              <option value="print_rendering">Print Rendering</option>
              <option value="print_ready">Print Ready</option>
              <option value="in_production">In Production</option>
              <option value="quality_check">Quality Check</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
            </select>
          </FormField>

          <FormField label="Workstation Operator Note">
            <input
              type="text"
              value={advanceNote}
              onChange={(e) => setAdvanceNote(e.target.value)}
              placeholder="e.g. Framed and ready for QC inspection"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanceModal(false)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkAdvance}
              disabled={isBulkProcessing}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isBulkProcessing ? 'Advancing Orders...' : 'Confirm Workstation Advance'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
