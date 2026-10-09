'use client';

import { formatPaise } from '../../../../lib/format-price';
import { groupOrderItems } from '../../../../lib/order-combo-groups';
import { Fragment, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { RefundModal } from '../../../../components/admin/RefundModal';
import { ItemFilesBox } from '../../../../components/admin/ItemFilesBox';
import { PersonalizationSummary } from '../../../../components/admin/PersonalizationSummary';
import { Timeline, type TimelineEvent } from '../../../../components/admin/Timeline';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { allowedTransitionsFrom, statusLabel, type Order, type OrderItem, type OrderStatus } from '@bro-pics/shared';

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
  const [confirmAdvance, setConfirmAdvance] = useState(false);
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

  // Everything needed to produce the order (previews, original photos, print-ready files) in one zip.
  const [downloadingZip, setDownloadingZip] = useState(false);
  const downloadAllFiles = async () => {
    if (!user) return;
    setDownloadingZip(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/files-zip`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not prepare the files.');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order?.orderNo ?? orderId}-files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not prepare the files.', 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

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
    if (nextStatus === 'shipped' && (!courierInput.trim() || !awbInput.trim())) {
      showToast('Enter the courier and AWB number before marking this order shipped.', 'error');
      setConfirmAdvance(false);
      return;
    }
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

      showToast(`Order #${order.orderNo} advanced to ${statusLabel(nextStatus)}`, 'success');
      setNextStatus('');
      setAdvanceNote('');
      fetchOrderDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error advancing status';
      showToast(msg, 'error');
    } finally {
      setIsAdvancing(false);
      setConfirmAdvance(false);
    }
  };

  // Moves that can't be quietly undone (or notify the customer) ask first.
  const requiresConfirmation = nextStatus === 'cancelled' || nextStatus === 'shipped' || nextStatus === 'delivered';

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

  // Convert raw order events into Timeline format. Events record who made the
  // change in `createdBy`: 'system' / 'system_*' for automatic steps, the
  // customer's uid for their own actions (placing or cancelling), anything
  // else is a staff member.
  const describeActor = (createdBy: string | undefined, customerUid: string | undefined): string => {
    if (!createdBy || createdBy === 'system' || createdBy.startsWith('system_')) return 'System';
    if (customerUid && createdBy === customerUid) return 'Customer';
    return `Staff ${createdBy.slice(0, 8)}`;
  };

  const timelineEvents: TimelineEvent[] = events.map((ev: unknown, i: number) => {
    const e = ev as {
      createdAt?: unknown;
      status?: string;
      createdBy?: string;
      note?: string;
      type?: string;
    };
    return {
      id: String(i),
      createdAt: e.createdAt ? String(e.createdAt) : new Date().toISOString(),
      title: e.status ? `Status changed to ${e.status.replace(/_/g, ' ')}` : (e.type || 'Order Event'),
      actor: describeActor(e.createdBy, order?.userId),
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
    recipientName?: string | null;
    label?: string | null;
    phone?: string;
    line1?: string;
    line2?: string | null;
    deliveryInstructions?: string | null;
    city?: string;
    state?: string;
    pincode?: string;
  } | undefined;

  // Only the transitions the order state machine actually allows from here
  // (the server enforces the same table). Refunds go through the refund flow,
  // not this dropdown.
  const advanceOptions = allowedTransitionsFrom(order.status).filter(
    (status) => status !== 'refunded' && status !== 'replacement_issued'
  );

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
                 Low DPI Photo Hold
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
            Resend Email/SMS
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
                Order Line Items ({items.length})
              </h2>
              <button
                type="button"
                onClick={downloadAllFiles}
                disabled={downloadingZip}
                className="rounded-lg bg-gold px-3 py-1.5 text-2xs font-bold text-ink transition-colors hover:bg-gold-deep disabled:opacity-50"
              >
                {downloadingZip ? 'Preparing zip…' : 'Download all files (zip)'}
              </button>
            </div>

            <div className="divide-y divide-line">
              {groupOrderItems(items, order?.combos).flatMap((group) =>
                group.kind === 'item'
                  ? [{ item: group.item, idx: group.index, head: null, frameLabel: null as string | null }]
                  : group.frames.map((frame, n) => ({ item: frame.item, idx: frame.index, head: n === 0 ? group : null, frameLabel: frame.label as string | null }))
              ).map(({ item, idx, head, frameLabel }) => (
                <Fragment key={item.id || idx}>
                {head && (
                  <div className="mt-3 rounded-xl bg-tint px-3 py-2 text-xs" data-testid="admin-order-combo">
                    <span className="font-bold text-ink">Combo offer: {head.name}</span>
                    <span className="text-ink/70"> · {head.frames.length} frames{head.price !== null ? ` · ${formatPaise(head.price)} paid for the set` : ''}</span>
                  </div>
                )}
                <div className={`py-3.5 ${frameLabel ? 'pl-3 border-l-2 border-gold/60' : ''}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl border border-line bg-field overflow-hidden shrink-0 flex items-center justify-center">
                      {item.previewPath ? (
                        <img src={`/api/admin/media/preview?path=${encodeURIComponent(item.previewPath)}`} alt="Item Preview" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-ink">{frameLabel ? `${frameLabel} · ` : ''}{item.title}</h3>
                      {(item.sizeLabel || item.frameColour || item.material) && (
                        <p className="text-2xs text-ink/70">
                          {[item.sizeLabel, item.frameColour, item.material].filter(Boolean).join(' · ')}
                          {item.sku ? <span className="font-mono text-ink/40"> · {item.sku}</span> : null}
                        </p>
                      )}
                      <p className="text-2xs text-ink/50">
                        Qty: <strong className="text-ink">{item.qty}</strong> × {formatPaise(item.unitPrice)}
                        {frameLabel ? ' (share of the combo price)' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-ink">
                      {formatPaise(item.unitPrice * item.qty)}
                    </span>
                  </div>
                </div>
                {item.personalization && (
                  <PersonalizationSummary
                    snapshot={item.personalization}
                    printSizeIn={item.widthIn && item.heightIn ? { width: item.widthIn, height: item.heightIn } : undefined}
                  />
                )}
                {item.id && <ItemFilesBox orderId={orderId} itemId={item.id} />}
                </div>
                </Fragment>
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
                              Original Photo
                            </a>
                          )}
                          {c.previewUrl && (
                            <a
                              href={c.previewUrl}
                              target="_blank"
                              className="px-2 py-1 bg-paper border border-line hover:bg-field rounded text-[10px] font-semibold text-ink"
                            >
                              Preview
                            </a>
                          )}
                          {c.printUrl && (
                            <a
                              href={c.printUrl}
                              target="_blank"
                              download
                              className="px-2 py-1 bg-gold text-ink font-bold rounded text-[10px]"
                            >
                              300 DPI Print File
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

            {order.paymentProvider === 'mock' && (
              <p role="status" className="rounded-xl border border-gold/50 bg-gold/15 px-3 py-2 text-2xs text-ink">
                <strong className="uppercase tracking-wider">Test payment</strong> — this order went through the mock payment provider. No money was collected.
              </p>
            )}

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
                <span className="font-semibold text-ink">{formatPaise(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="font-semibold text-emerald-700">-{formatPaise(order.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping:</span>
                <span className="font-semibold text-ink">{formatPaise(order.shipping)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-ink pt-1 border-t border-line">
                <span>Total Amount:</span>
                <span className="text-gold-deep">{formatPaise(order.total)}</span>
              </div>
              {order.paymentMode === 'partial_cod' && (
                <div className="flex justify-between text-2xs text-amber-800 font-semibold bg-amber-50 p-2 rounded-lg mt-2">
                  <span>Paid Online: {formatPaise(order.amountPaidOnline)}</span>
                  <span>Due on Delivery (COD): {formatPaise(order.amountDueOnDelivery)}</span>
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
              {advanceOptions.length === 0 ? (
                <p className="text-2xs text-ink/60">
                  This order is {statusLabel(order.status).toLowerCase()} — no further status changes are available.
                </p>
              ) : (
              <FormField label="Target Status" required>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                >
                  <option value="">-- Choose Next Status --</option>
                  {advanceOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </FormField>
              )}

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
                onClick={() => (requiresConfirmation ? setConfirmAdvance(true) : handleAdvanceStatus())}
                disabled={!nextStatus || isAdvancing || (nextStatus === 'shipped' && (!courierInput.trim() || !awbInput.trim()))}
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
              <span className="font-bold text-ink block">{address?.recipientName || order.customerName || 'Customer'}</span>
              {address?.recipientName && order.customerName && address.recipientName !== order.customerName && (
                <span className="block text-2xs text-ink/60">Gift — ordered by {order.customerName}</span>
              )}
              <span className="block font-mono text-2xs">{address?.phone || 'No phone'}</span>
              <p className="pt-1 text-2xs text-ink/70">
                {address?.line1}
                {address?.line2 ? `, ${address.line2}` : ''}
                <br />
                {address?.city}, {address?.state} - {address?.pincode}
              </p>
              {address?.deliveryInstructions && (
                <p className="pt-1 text-2xs text-ink/70">
                  <strong className="text-ink">Delivery note:</strong> {address.deliveryInstructions}
                </p>
              )}
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

      <ConfirmDialog
        isOpen={confirmAdvance}
        title={nextStatus ? `Mark order as ${statusLabel(nextStatus)}?` : 'Change order status?'}
        message={
          nextStatus === 'cancelled'
            ? `This cancels order #${order.orderNo}. It can't be undone, and the customer is notified.`
            : `The customer is notified that order #${order.orderNo} is ${nextStatus ? statusLabel(nextStatus).toLowerCase() : 'updated'}. This can't be undone.`
        }
        confirmLabel={nextStatus ? `Yes, mark ${statusLabel(nextStatus).toLowerCase()}` : 'Confirm'}
        tone={nextStatus === 'cancelled' ? 'danger' : 'default'}
        isLoading={isAdvancing}
        onConfirm={handleAdvanceStatus}
        onCancel={() => setConfirmAdvance(false)}
      />

      {/* Refund Modal */}
      <RefundModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        orderId={order.id}
        orderNo={order.orderNo}
        orderTotal={order.total}
        paymentProvider={order.paymentProvider}
        onSuccess={fetchOrderDetails}
      />
    </div>
  );
}
