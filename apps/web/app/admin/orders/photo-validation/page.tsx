'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';
import { StatusChip } from '../../../../components/admin/StatusChip';
import Link from 'next/link';

interface OrderValidationItem {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  total: number;
  placedAt: string;
  photoCount: number;
  minDpi: number;
  dpiTier: 'good' | 'warning' | 'poor';
  thumbnailUrl?: string;
  customizationSummary?: string;
}

export default function PhotoValidationQueuePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchQueue = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      // Fetch orders in photo_validation or payment_confirmed status
      const res = await fetch('/api/admin/orders?status=photo_validation', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const items = (json.orders || []).map((o: any) => ({
          id: o.id,
          orderNo: o.orderNo || o.id.slice(0, 8),
          customerName: o.addressJson?.name || o.customerName || 'Customer',
          customerPhone: o.addressJson?.phone || o.customerPhone || '—',
          total: o.total || 149900,
          placedAt: o.placedAt || o.createdAt,
          photoCount: o.itemCount || 1,
          minDpi: o.minDpi || 128,
          dpiTier: (o.minDpi || 128) < 150 ? 'warning' : 'good',
          thumbnailUrl: o.previewUrl || '/placeholders/product-thumb.jpg',
          customizationSummary: o.productTitle || 'Custom Classic Frame (12x18 in)',
        }));
        setOrders(items);
      }
    } catch (err) {
      console.error('Failed to fetch photo validation queue', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [user]);

  const handleAction = async (orderId: string, action: 'approve' | 'request_reupload') => {
    if (!user) return;
    setProcessingId(orderId);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/photo-validation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          staffNote: action === 'approve' ? 'Approved by staff review' : 'Photo resolution too low for 300 DPI print',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update photo validation status');
      }

      setMessage({
        type: 'success',
        text: action === 'approve'
          ? `Order #${orderId} approved and queued for 300 DPI print rendering!`
          : `Re-upload request dispatched to customer for Order #${orderId}.`,
      });

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Action failed' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-cream">
              Low-DPI Photo Validation Queue
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/40">
              {orders.length} Held for Review
            </span>
          </div>
          <p className="text-sm text-sand/70 mt-1">
            Orders held because customer uploaded photos below optimal 300 DPI resolution. Prevent print pixelation and refund disputes.
          </p>
        </div>

        <button
          onClick={fetchQueue}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream transition flex items-center gap-2"
        >
          <span>🔄</span> Refresh Queue
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Queue Grid */}
      {loading ? (
        <div className="p-12 text-center text-sand/60 bg-paper rounded-2xl border border-line">
          Loading photo validation queue...
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center text-sand/70 bg-paper rounded-2xl border border-line space-y-2">
          <div className="text-3xl">🎉</div>
          <h3 className="font-semibold text-cream text-base">Photo Validation Queue is Clean</h3>
          <p className="text-xs text-sand/60 max-w-sm mx-auto">
            All customer photos meet resolution thresholds and have passed directly into the print pipeline.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((o) => (
            <div
              key={o.id}
              className="p-5 rounded-2xl bg-paper border border-line flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono font-bold text-base text-cream hover:text-gold transition"
                    >
                      #{o.orderNo}
                    </Link>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/60 text-amber-400 border border-amber-800/40">
                      {o.minDpi} DPI (Low)
                    </span>
                  </div>
                  <div className="text-xs text-sand/80 mt-1">
                    <span className="font-semibold text-cream">{o.customerName}</span> • {o.customerPhone}
                  </div>
                  <div className="text-xs text-sand/60 mt-0.5">
                    {o.customizationSummary}
                  </div>
                </div>

                <div className="text-right font-mono text-xs">
                  <div className="font-bold text-cream">{formatPaise(o.total)}</div>
                  <div className="text-sand/50 text-[10px]">
                    {new Date(o.placedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Resolution Inspection Badge */}
              <div className="p-3 rounded-xl bg-void/60 border border-line flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <div>
                    <div className="font-medium text-amber-300">Minimum Slot DPI: {o.minDpi} DPI</div>
                    <div className="text-[10px] text-sand/60">
                      Recommended: 240-300 DPI for sharp fine-art output
                    </div>
                  </div>
                </div>

                <Link
                  href={`/admin/orders/${o.id}`}
                  className="text-xs text-gold hover:underline font-mono"
                >
                  Inspect Assets →
                </Link>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-line/60">
                <button
                  onClick={() => handleAction(o.id, 'request_reupload')}
                  disabled={processingId === o.id}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-charcoal hover:bg-tint border border-line text-amber-400 hover:border-amber-400 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>✉️</span> Request Re-Upload Link
                </button>
                <button
                  onClick={() => handleAction(o.id, 'approve')}
                  disabled={processingId === o.id}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {processingId === o.id ? (
                    <span className="animate-spin inline-block w-3 h-3 border border-void border-t-transparent rounded-full" />
                  ) : (
                    <span>✓</span>
                  )}
                  Approve For Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
