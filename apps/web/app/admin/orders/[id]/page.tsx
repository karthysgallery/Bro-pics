'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { RefundModal } from '../../../../components/admin/RefundModal';
import { Timeline, type TimelineEvent } from '../../../../components/admin/Timeline';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import type { Order, OrderItem, OrderStatus } from '@bro-pics/shared';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatIST(val: unknown): string {
  if (!val) return '—';
  if (typeof val === 'object' && '_seconds' in (val as { _seconds: number })) {
    return new Date((val as { _seconds: number })._seconds * 1000).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const d = new Date(val as string | number | Date);
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

export default function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const { id: orderId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<unknown[]>([]);
  const [customizations, setCustomizations] = useState<unknown[]>([]);
  const [hasRedDpi, setHasRedDpi] = useState(false);
  const [loading, setLoading] = useState(true);

  // Workflow actions
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [awbInput, setAwbInput] = useState('');
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Staff internal notes
  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Tracking URL
  const [trackingUrl, setTrackingUrl] = useState('');
  const [isSavingTracking, setIsSavingTracking] = useState(false);

  // Refund Modal
  const [showRefundModal, setShowRefundModal] = useState(false);

  // Fetch Full Order Details
  const fetchOrderDetails = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load order details');
      const data = await res.json();
      setOrder(data.order);
      setItems(data.items || []);
      setEvents(data.events || []);
      setCustomizations(data.customizations || []);
      setHasRedDpi(Boolean(data.hasRedDpi));
      setNotesText(data.order.notes || '');
      setTrackingUrl(data.order.shipmentTracking?.trackingUrl || '');
    } catch {
      showToast('Error loading order details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId, user]);

  // Handle Advance Status
  const handleAdvanceStatus = async () => {
    if (!user || !order || !nextStatus) return;
    setIsAdvancing(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/orders/${order.orderNo}/advance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          note: advanceNote.trim() || undefined,
          courier: nextStatus === 'shipped' ? courierInput.trim() || undefined : undefined,
          awbNumber: nextStatus === 'shipped' ? awbInput.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to advance order status');
      }

      showToast(`Order #${order.orderNo} advanced to ${nextStatus}`, 'success');
      setNextStatus('');
      setAdvanceNote('');
      fetchOrderDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error advancing status';
      showToast(msg, 'error');
    } finally {
      setIsAdvancing(false);
    }
  };

  // Save Internal Notes
  const handleSaveNotes = async () => {
    if (!user) return;
    setIsSavingNotes(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: notesText }),
      });

      if (!res.ok) throw new Error('Failed to update notes');
      showToast('Internal notes updated', 'success');
      fetchOrderDetails();
    } catch {
      showToast('Error saving notes', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Save Tracking URL
  const handleSaveTracking = async () => {
    if (!user) return;
    setIsSavingTracking(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/shipping`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingUrl }),
      });

      if (!res.ok) throw new Error('Failed to update tracking URL');
      showToast('Tracking URL saved', 'success');
      fetchOrderDetails();
    } catch {
      showToast('Error saving tracking URL', 'error');
    } finally {
      setIsSavingTracking(false);
    }
  };

  // Resend Notification
  const handleResendNotification = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/resend-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'order_confirmed' }),
      });

      if (!res.ok) throw new Error('Failed to dispatch notification');
      showToast('Customer notification queued', 'success');
      fetchOrderDetails();
    } catch {
      showToast('Error resending notification', 'error');
    }
  };

  // Convert raw order events into Timeline format
  const timelineEvents: TimelineEvent[] = events.map((ev: unknown, i: number) => {
    const e = ev as {
      createdAt?: unknown;
      status?: string;
      actorUid?: string;
      note?: string;
      type?: string;
    };
    return {
      id: String(i),
      createdAt: e.createdAt ? String(e.createdAt) : new Date().toISOString(),
      title: e.status ? `Status changed to ${e.status.replace(/_/g, ' ')}` : (e.type || 'Order Event'),
      actor: e.actorUid ? `Staff: ${e.actorUid.slice(0, 6)}...` : 'System',
      description: e.note,
    };
  });

  if (loading || !order) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-field rounded-lg" />
        <div className="h-64 w-full bg-field rounded-2xl" />
      </div>
    );
  }

  const address = order.addressJson as {
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | undefined;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-2xs text-ink/50 mb-1">
            <Link href="/admin/orders" className="hover:text-gold transition-colors">Orders</Link>
            <span>/</span>
            <span className="text-ink font-semibold">#{order.orderNo}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
              Order #{order.orderNo}
            </h1>
            <StatusChip status={order.status} />
            {hasRedDpi && (
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-2xs font-bold border border-red-300">
                ⚠️ Low DPI Photo Hold
              </span>
            )}
          </div>
          <p className="text-xs text-ink/60 mt-0.5">
            Placed on {formatIST(order.placedAt)} · ID: <span className="font-mono">{order.id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResendNotification}
            className="px-3 py-1.5 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            ✉️ Resend Email/SMS
          </button>
          <button
            type="button"
            onClick={() => setShowRefundModal(true)}
            className="px-3.5 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
          >
            ₹ Issue Refund
          </button>
        </div>
      </div>

      {/* Main 2-Col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Line items, Customizations, Payments, Shipping, Notes */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1: Line Items Table */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Order Line Items ({items.length})
            </h2>

            <div className="divide-y divide-line">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl border border-line bg-field overflow-hidden shrink-0 flex items-center justify-center">
                      {item.previewPath ? (
                        <img src={`/api/admin/media/preview?path=${encodeURIComponent(item.previewPath)}`} alt="Item Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">🖼️</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-ink">{item.title}</h3>
                      <p className="text-2xs text-ink/50">
                        Qty: <strong className="text-ink">{item.qty}</strong> × ₹{item.unitPrice}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-ink">
                      ₹{item.unitPrice * item.qty}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Customizations & Photo Downloads */}
            {customizations.length > 0 && (
              <div className="pt-3 border-t border-line space-y-3">
                <span className="text-2xs font-bold text-ink uppercase tracking-wider block">
                  Customer Upload & Print Files
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customizations.map((cust: unknown, idx) => {
                    const c = cust as {
                      personalizationId: string;
                      originalPhotoUrl?: string;
                      previewUrl?: string;
                      printUrl?: string;
                      dpiScore?: number;
                      dpiBand?: 'green' | 'yellow' | 'red';
                      templateVersion?: number;
                      textInputs?: Record<string, string>;
                    };
                    return (
                      <div key={c.personalizationId || idx} className="p-3 rounded-xl border border-line bg-field/40 space-y-2 text-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink">Item #{idx + 1} Personalization</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.dpiBand === 'green'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.dpiBand === 'yellow'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            DPI: {c.dpiScore || '300'} ({c.dpiBand || 'green'})
                          </span>
                        </div>

                        {c.textInputs && Object.keys(c.textInputs).length > 0 && (
                          <div className="space-y-0.5 text-ink/70">
                            {Object.entries(c.textInputs).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-ink/40">{k}:</span>
                                <span className="font-semibold text-ink">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 border-t border-line/50">
                          {c.originalPhotoUrl && (
                            <a
                              href={c.originalPhotoUrl}
                              target="_blank"
                              download
                              className="px-2 py-1 bg-paper border border-line hover:bg-field rounded text-[10px] font-semibold text-ink"
                            >
                              📥 Original Photo
                            </a>
                          )}
                          {c.previewUrl && (
                            <a
                              href={c.previewUrl}
                              target="_blank"
                              className="px-2 py-1 bg-paper border border-line hover:bg-field rounded text-[10px] font-semibold text-ink"
                            >
                              👁️ Preview
                            </a>
                          )}
                          {c.printUrl && (
                            <a
                              href={c.printUrl}
                              target="_blank"
                              download
                              className="px-2 py-1 bg-gold text-ink font-bold rounded text-[10px]"
                            >
                              🖨️ 300 DPI Print File
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Payment & Financials */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Payment & Invoicing
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-field text-2xs">
              <div>
                <span className="text-ink/50 block">Payment Mode</span>
                <span className="font-bold text-ink uppercase">{order.paymentMode}</span>
              </div>
              <div>
                <span className="text-ink/50 block">Payment Status</span>
                <span className="font-bold text-ink uppercase">{order.paymentStatus}</span>
              </div>
              <div>
                <span className="text-ink/50 block">Invoice Number</span>
                <span className="font-mono font-bold text-ink">{order.invoiceNo || 'Pending'}</span>
              </div>
              <div>
                <span className="text-ink/50 block">Razorpay Payment ID</span>
                <span className="font-mono text-ink/70 truncate block">{order.razorpayPaymentId || '—'}</span>
              </div>
            </div>

            <div className="space-y-1 text-xs text-ink/70 pt-2 border-t border-line">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold text-ink">₹{order.subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="font-semibold text-emerald-700">-₹{order.discount}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping:</span>
                <span className="font-semibold text-ink">₹{order.shipping}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-ink pt-1 border-t border-line">
                <span>Total Amount:</span>
                <span className="text-gold-deep">₹{order.total}</span>
              </div>
              {order.paymentMode === 'partial_cod' && (
                <div className="flex justify-between text-2xs text-amber-800 font-semibold bg-amber-50 p-2 rounded-lg mt-2">
                  <span>Paid Online: ₹{order.amountPaidOnline}</span>
                  <span>Due on Delivery (COD): ₹{order.amountDueOnDelivery}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Shipping & Tracking */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Shipping & Fulfilment
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-2xs">
              <div className="p-3 rounded-xl bg-field border border-line">
                <span className="text-ink/50 block mb-1">Courier Partner</span>
                <span className="font-bold text-ink text-xs">{order.courier || 'Unassigned'}</span>
              </div>
              <div className="p-3 rounded-xl bg-field border border-line">
                <span className="text-ink/50 block mb-1">AWB Number</span>
                <span className="font-mono font-bold text-ink text-xs">{order.awbNumber || '—'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-2xs font-bold text-ink uppercase tracking-wider block">
                Public Tracking URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://track.delhivery.com/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
                />
                <button
                  type="button"
                  onClick={handleSaveTracking}
                  disabled={isSavingTracking}
                  className="px-4 py-2 rounded-xl bg-ink text-gold hover:bg-ink/80 text-xs font-bold transition-colors shrink-0 disabled:opacity-50"
                >
                  {isSavingTracking ? 'Saving...' : 'Update Tracking'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Internal Staff Notes */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
                Internal Staff Notes
              </h2>
              <span className="text-2xs text-ink/40">Never visible to customers</span>
            </div>

            <textarea
              rows={3}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Add internal production instructions, customer phone notes, or special packaging requests..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="px-4 py-1.5 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isSavingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Advance status, Customer info, Timeline */}
        <div className="lg:col-span-4 space-y-6 sticky top-6">
          {/* Advance Workflow Card */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Advance Status
            </h2>

            <div className="space-y-3">
              <FormField label="Target Status" required>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                >
                  <option value="">-- Choose Next Status --</option>
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

              {nextStatus === 'shipped' && (
                <div className="space-y-3 p-3 rounded-xl bg-field border border-line">
                  <FormField label="Courier Partner" required>
                    <input
                      type="text"
                      value={courierInput}
                      onChange={(e) => setCourierInput(e.target.value)}
                      placeholder="Delhivery / Bluedart / DTDC"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink"
                    />
                  </FormField>
                  <FormField label="AWB Tracking Number" required>
                    <input
                      type="text"
                      value={awbInput}
                      onChange={(e) => setAwbInput(e.target.value)}
                      placeholder="AWB123456789"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink font-mono"
                    />
                  </FormField>
                </div>
              )}

              <FormField label="Transition Note">
                <input
                  type="text"
                  value={advanceNote}
                  onChange={(e) => setAdvanceNote(e.target.value)}
                  placeholder="Optional audit log comment"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink"
                />
              </FormField>

              <button
                type="button"
                onClick={handleAdvanceStatus}
                disabled={!nextStatus || isAdvancing}
                className="w-full py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isAdvancing ? 'Advancing...' : 'Advance Order'}
              </button>
            </div>
          </div>

          {/* Customer Address Card */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-3 text-xs">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Customer & Delivery Address
            </h2>

            <div className="space-y-1 text-ink/80">
              <span className="font-bold text-ink block">{address?.fullName || 'Customer'}</span>
              <span className="block font-mono text-2xs">{address?.phone || 'No phone'}</span>
              <p className="pt-1 text-2xs text-ink/70">
                {address?.addressLine1}
                {address?.addressLine2 ? `, ${address.addressLine2}` : ''}
                <br />
                {address?.city}, {address?.state} - {address?.pincode}
              </p>
            </div>
          </div>

          {/* Events Timeline */}
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              Order Audit Timeline
            </h2>

            <Timeline events={timelineEvents} />
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      <RefundModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        orderId={order.id}
        orderNo={order.orderNo}
        orderTotal={order.total}
        onSuccess={fetchOrderDetails}
      />
    </div>
  );
}
