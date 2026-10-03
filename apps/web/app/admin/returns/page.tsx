'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { AdminModal } from '../../../components/admin/AdminModal';
import { RefundModal } from '../../../components/admin/RefundModal';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import { isValidReturnStatusTransition, type Return, type ReturnStatus } from '@bro-pics/shared';

const RETURN_STATUS_TABS: { key: ReturnStatus; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'pickup_scheduled', label: 'Pickup Scheduled' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'refund_processing', label: 'Refund Processing' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'rejected', label: 'Rejected' },
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

export default function AdminReturnsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ReturnStatus>('requested');
  const [returnsList, setReturnsList] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Return for Drawer / Modal
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [nextStatus, setNextStatus] = useState<ReturnStatus | ''>('');
  const [staffNote, setStaffNote] = useState('');
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Photo viewer modal
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);

  // Refund modal
  const [showRefundModal, setShowRefundModal] = useState(false);

  // Fetch Returns
  const fetchReturns = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/returns?status=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load returns queue');
      const data = await res.json();
      setReturnsList(data.returns || []);
    } catch {
      showToast('Error loading returns', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [user, activeTab]);

  // Advance Return Status
  const handleAdvanceReturn = async () => {
    if (!user || !selectedReturn || !nextStatus) return;
    setIsAdvancing(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/returns/${selectedReturn.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          staffNote: staffNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to advance return');
      }

      showToast(`Return #${selectedReturn.id.slice(0, 8)} updated to ${nextStatus}`, 'success');
      setSelectedReturn(null);
      setNextStatus('');
      setStaffNote('');
      fetchReturns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating return';
      showToast(msg, 'error');
    } finally {
      setIsAdvancing(false);
    }
  };

  const validNextStatuses = selectedReturn
    ? (['requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'refund_processing', 'refunded'] as ReturnStatus[]).filter((s) =>
        isValidReturnStatusTransition(selectedReturn.status, s)
      )
    : [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Returns, Replacements & Refunds
          </h1>
          <p className="text-xs text-ink/60">
            Review customer return requests, inspect damage evidence photos, schedule courier pickups, and trigger instant Razorpay refunds.
          </p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-line overflow-x-auto pb-px flex items-center gap-1">
        {RETURN_STATUS_TABS.map((tab) => (
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

      {/* Table / Queue */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : returnsList.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-2">
            <span className="text-3xl block">✨</span>
            <p>No returns currently in &quot;{activeTab.replace(/_/g, ' ')}&quot; state.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                  <th className="p-3">Return ID</th>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Resolution</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Requested At</th>
                  <th className="p-3">Evidence</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {returnsList.map((ret) => {
                  const photos = (ret as unknown as { photoUrls?: string[] }).photoUrls || [];

                  return (
                    <tr key={ret.id} className="hover:bg-field/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-ink">
                        #{ret.id.slice(0, 8)}
                      </td>

                      <td className="p-3">
                        <Link
                          href={`/admin/orders/${ret.orderId}`}
                          className="font-mono text-gold-deep hover:underline font-semibold"
                        >
                          #{ret.orderId.slice(0, 8)}... ↗
                        </Link>
                      </td>

                      <td className="p-3 text-ink max-w-xs truncate" title={ret.reason}>
                        {ret.reason}
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ret.resolution === 'replacement'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {ret.resolution || 'refund'}
                        </span>
                      </td>

                      <td className="p-3 font-bold text-ink">
                        ₹{(ret.refundAmount / 100).toFixed(0)}
                      </td>

                      <td className="p-3 text-ink/70 font-mono text-2xs">
                        {formatISTDate(ret.requestedAt)}
                      </td>

                      <td className="p-3">
                        {photos.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setViewingPhotoUrl(photos[0])}
                            className="px-2 py-1 bg-gold/10 hover:bg-gold/20 text-gold-deep rounded text-2xs font-bold transition-colors"
                          >
                            📷 View ({photos.length})
                          </button>
                        ) : (
                          <span className="text-2xs text-ink/40 italic">No photos</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturn(ret);
                            setNextStatus('');
                            setStaffNote('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-gold hover:bg-gold-deep text-ink text-2xs font-bold transition-colors shadow-xs"
                        >
                          Review & Advance
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Advance Modal */}
      {selectedReturn && (
        <AdminModal
          isOpen={Boolean(selectedReturn)}
          onClose={() => setSelectedReturn(null)}
          title={`Review Return #${selectedReturn.id.slice(0, 8)}`}
          description={`Order reference: ${selectedReturn.orderId}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-field border border-line space-y-2 text-2xs">
              <div className="flex justify-between">
                <span>Customer Reason:</span>
                <span className="font-semibold text-ink text-right max-w-xs">{selectedReturn.reason}</span>
              </div>
              <div className="flex justify-between">
                <span>Resolution Chosen:</span>
                <span className="font-bold text-ink uppercase">{selectedReturn.resolution || 'refund'}</span>
              </div>
              <div className="flex justify-between">
                <span>Refund Amount:</span>
                <span className="font-bold text-emerald-700">₹{(selectedReturn.refundAmount / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Status:</span>
                <StatusChip status={selectedReturn.status} size="sm" />
              </div>
            </div>

            {validNextStatuses.length > 0 ? (
              <div className="space-y-3">
                <FormField label="Move to Status" required>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as ReturnStatus)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  >
                    <option value="">-- Choose Next Transition --</option>
                    {validNextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Staff Note / Inspection Remark">
                  <input
                    type="text"
                    value={staffNote}
                    onChange={(e) => setStaffNote(e.target.value)}
                    placeholder="e.g. Damage confirmed in corner frame joint; approved for full refund"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>
              </div>
            ) : (
              <p className="text-2xs text-ink/60 italic">This return is in a terminal status ({selectedReturn.status}).</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setShowRefundModal(true);
                }}
                className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold"
              >
                ₹ Direct Refund Modal
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
                >
                  Cancel
                </button>
                {validNextStatuses.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAdvanceReturn}
                    disabled={!nextStatus || isAdvancing}
                    className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {isAdvancing ? 'Updating...' : 'Save & Advance'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Evidence Photo Viewer Modal */}
      {viewingPhotoUrl && (
        <AdminModal
          isOpen={Boolean(viewingPhotoUrl)}
          onClose={() => setViewingPhotoUrl(null)}
          title="Customer Evidence Photo"
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-field overflow-hidden flex items-center justify-center p-2 max-h-[500px]">
              <img src={viewingPhotoUrl} alt="Return Evidence" className="max-h-[480px] object-contain rounded-lg" />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewingPhotoUrl(null)}
                className="px-4 py-2 rounded-xl bg-ink text-gold text-xs font-semibold"
              >
                Close Photo Viewer
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Refund Modal */}
      {selectedReturn && (
        <RefundModal
          isOpen={showRefundModal}
          onClose={() => setShowRefundModal(false)}
          orderId={selectedReturn.orderId}
          orderNo={selectedReturn.orderId.slice(0, 8)}
          orderTotal={Math.round(selectedReturn.refundAmount / 100)}
          onSuccess={() => {
            fetchReturns();
            setSelectedReturn(null);
          }}
        />
      )}
    </div>
  );
}
