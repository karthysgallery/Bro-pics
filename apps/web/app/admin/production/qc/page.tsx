'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { AdminModal } from '../../../../components/admin/AdminModal';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import type { Order, OrderItem } from '@bro-pics/shared';

const QC_CHECKLIST_ITEMS = [
  { id: 'corners', label: 'Frame Corners & Joints', desc: '45° miter corners are flush and tight with no wood splinters or gaps' },
  { id: 'glass', label: 'Plexiglass Cleanliness', desc: 'Front and back of glass are clean with zero dust, fingerprints, or hairline scratches' },
  { id: 'print', label: 'Print Clarity & Colors', desc: '300 DPI archival print resolution with no ink banding or color shifts' },
  { id: 'text', label: 'Personalization & Layout', desc: 'Customer names, dates, quotes and clipart match order specifications exactly' },
  { id: 'hardware', label: 'Mounting Hardware', desc: 'Sawtooth hangers, screws, and backing clips are firmly secured and tested' },
];

export default function QualityCheckStationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [qcOrders, setQcOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Checklist state
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // QC Actions
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [failReason, setFailReason] = useState('Corner Joint Gap');
  const [failNotes, setFailNotes] = useState('');

  // Fetch QC Queue
  const fetchQcQueue = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/orders?status=quality_check', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load QC queue');
      const data = await res.json();
      const ordersList: Order[] = data.orders || [];
      setQcOrders(ordersList);

      if (ordersList.length > 0 && (!selectedOrder || !ordersList.some((o) => o.id === selectedOrder.id))) {
        inspectOrder(ordersList[0]);
      } else if (ordersList.length === 0) {
        setSelectedOrder(null);
        setSelectedItems([]);
      }
    } catch {
      showToast('Error loading QC queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQcQueue();
  }, [user]);

  // Inspect Single Order
  const inspectOrder = async (order: Order) => {
    setSelectedOrder(order);
    setChecks({});
    setLoadingOrder(true);
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedItems(data.items || []);
      }
    } catch {
      showToast('Error loading order items', 'error');
    } finally {
      setLoadingOrder(false);
    }
  };

  const handleToggleCheck = (checkId: string) => {
    setChecks((prev) => ({ ...prev, [checkId]: !prev[checkId] }));
  };

  const isAllChecked = QC_CHECKLIST_ITEMS.every((item) => checks[item.id]);

  // Handle PASS
  const handlePassQC = async () => {
    if (!user || !selectedOrder || !isAllChecked) return;
    setIsSubmitting(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/qc`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result: 'pass' }),
      });

      if (!res.ok) throw new Error('Failed to submit QC pass');
      showToast(`Order #${selectedOrder.orderNo} PASSED QC! Moved to Packed station.`, 'success');
      fetchQcQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting QC';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle FAIL
  const handleFailQC = async () => {
    if (!user || !selectedOrder) return;
    setIsSubmitting(true);

    try {
      const token = await user.getIdToken();
      const combinedReason = `${failReason}: ${failNotes}`.trim();
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/qc`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          result: 'fail',
          reason: combinedReason,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit QC rework');
      showToast(`Order #${selectedOrder.orderNo} failed QC. Sent to Rework station.`, 'info');
      setShowFailModal(false);
      setFailNotes('');
      fetchQcQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting QC';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-field rounded-xl" />
        <div className="h-96 w-full bg-field rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-2xs text-ink/50 mb-1">
            <Link href="/admin/production" className="hover:text-gold transition-colors">Production</Link>
            <span>/</span>
            <span className="text-ink font-semibold">QC Inspection</span>
          </div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Quality Control Inspection Workstation
          </h1>
          <p className="text-xs text-ink/60">
            5-point quality checklist before final packing. Orders must pass all checks before dispatch boxing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/production"
            className="px-3.5 py-2 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            ← Back to Production Queue
          </Link>
        </div>
      </div>

      {qcOrders.length === 0 ? (
        <div className="p-16 border border-line rounded-2xl bg-paper text-center space-y-3">
          <span className="text-4xl block">🛡️</span>
          <h2 className="text-base font-bold text-ink">All QC Inspections Complete</h2>
          <p className="text-xs text-ink/50 max-w-md mx-auto">
            There are currently no orders waiting in the Quality Check station queue.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (4 cols): Queue of Orders */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-line bg-paper p-4 shadow-xs space-y-3">
              <span className="text-xs font-bold text-ink uppercase tracking-wider block">
                Pending Inspection ({qcOrders.length})
              </span>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {qcOrders.map((o) => {
                  const isSelected = selectedOrder?.id === o.id;
                  return (
                    <div
                      key={o.id}
                      onClick={() => inspectOrder(o)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-gold bg-gold/10 shadow-xs ring-1 ring-gold/40'
                          : 'border-line bg-paper hover:bg-field'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-ink">#{o.orderNo}</span>
                        <StatusChip status={o.status} size="sm" />
                      </div>
                      <div className="flex items-center justify-between text-2xs text-ink/60 mt-1">
                        <span>₹{o.total}</span>
                        <span className="capitalize">{o.deliveryMethod || 'standard'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column (8 cols): 5-Point Checklist & Inspection Box */}
          <div className="lg:col-span-8 space-y-6">
            {selectedOrder && (
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <h2 className="text-base font-bold text-ink flex items-center gap-2">
                      <span>Inspecting Order #{selectedOrder.orderNo}</span>
                      <StatusChip status={selectedOrder.status} size="sm" />
                    </h2>
                    <p className="text-2xs text-ink/50 font-mono mt-0.5">Order ID: {selectedOrder.id}</p>
                  </div>

                  <Link
                    href={`/admin/orders/${selectedOrder.id}`}
                    target="_blank"
                    className="px-3 py-1.5 rounded-lg border border-line hover:bg-field text-2xs font-semibold text-ink"
                  >
                    Open Full Details ↗
                  </Link>
                </div>

                {/* Items Summary */}
                <div className="space-y-3">
                  <span className="text-2xs font-bold text-ink uppercase tracking-wider block">Items to Inspect</span>
                  {loadingOrder ? (
                    <div className="h-16 bg-field rounded-xl animate-pulse" />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedItems.map((item, idx) => (
                        <div key={item.id || idx} className="p-3 rounded-xl border border-line bg-field/40 flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-paper border border-line overflow-hidden shrink-0 flex items-center justify-center">
                            {item.previewPath ? (
                              <img src={`/api/admin/media/preview?path=${encodeURIComponent(item.previewPath)}`} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <span>🖼️</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-2xs">
                            <h4 className="font-bold text-ink truncate">{item.title}</h4>
                            <p className="text-ink/60">Unit: ₹{item.unitPrice}</p>
                            <p className="text-ink/50 font-mono">Qty: {item.qty}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5-Point Quality Checklist */}
                <div className="space-y-3 pt-4 border-t border-line">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink uppercase tracking-wider block">
                      5-Point Physical Inspection Checklist
                    </span>
                    <span className="text-2xs font-mono text-ink/60">
                      {Object.values(checks).filter(Boolean).length} / {QC_CHECKLIST_ITEMS.length} Checked
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {QC_CHECKLIST_ITEMS.map((item) => {
                      const isChecked = Boolean(checks[item.id]);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                            isChecked
                              ? 'border-emerald-300 bg-emerald-50/50'
                              : 'border-line bg-field/30 hover:bg-field'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleCheck(item.id)}
                            className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                          <div className="flex-1">
                            <span className="text-xs font-bold text-ink block">{item.label}</span>
                            <span className="text-2xs text-ink/60 block mt-0.5">{item.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Decision Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowFailModal(true)}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors"
                  >
                    ❌ FAIL QC & Send to Rework
                  </button>

                  <button
                    type="button"
                    onClick={handlePassQC}
                    disabled={!isAllChecked || isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-md disabled:opacity-40 disabled:bg-gray-400"
                  >
                    {isSubmitting ? 'Submitting...' : '✓ PASS Inspection (Move to Packed)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QC Fail Modal */}
      <AdminModal
        isOpen={showFailModal}
        onClose={() => setShowFailModal(false)}
        title="Send Order to Rework"
        description="Specify defect reasons for shop floor assembly rework"
      >
        <div className="space-y-4">
          <FormField label="Primary Defect Reason" required>
            <select
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            >
              <option value="Corner Joint Gap">Corner Joint Gap / Wood Splinter</option>
              <option value="Glass Scratched or Dirty">Glass Scratched / Dust Inside</option>
              <option value="Print Color Banding">Print Color Banding / Misprint</option>
              <option value="Text Spelling Error">Text Spelling / Alignment Error</option>
              <option value="Loose Hardware">Loose Backing Clips / Defective Hanger</option>
              <option value="Other">Other Manufacturing Flaw</option>
            </select>
          </FormField>

          <FormField label="Rework Instructions for Framing Staff" required>
            <textarea
              rows={3}
              value={failNotes}
              onChange={(e) => setFailNotes(e.target.value)}
              placeholder="e.g. Re-mount in new Teak 8x12 frame; bottom-right corner has a 1mm gap..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              required
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowFailModal(false)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFailQC}
              disabled={isSubmitting || !failNotes.trim()}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Confirm Rework'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
