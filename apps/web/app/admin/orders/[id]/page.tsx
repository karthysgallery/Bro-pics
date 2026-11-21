'use client';

import { formatPaise } from '../../../../lib/format-price';
import { groupOrderItems } from '../../../../lib/order-combo-groups';
import { Fragment, useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { RefundModal } from '../../../../components/admin/RefundModal';
import { ItemFilesBox } from '../../../../components/admin/ItemFilesBox';
import { PersonalizationSummary } from '../../../../components/admin/PersonalizationSummary';
import { PaymentBadge, ProductThumb } from '../../../../components/admin/OrderBadges';
import { PaymentCheck } from '../../../../components/admin/PaymentCheck';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { paymentState } from '../../../../lib/admin-orders-view';
import { allowedTransitionsFrom, statusLabel, type Order, type OrderItem, type OrderStatus } from '@bro-pics/shared';

/*
 * One order, in the order staff need it: what is ordered and where it is (header + progress), what to do next,
 * the customer's photos and the production files, the payment, the customer, shipping, notes, and the history.
 */

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

interface RefundRow {
  id: string;
  amount: number;
  status: string | null;
  reason: string | null;
  razorpayRefundId: string | null;
  failureReason: string | null;
  createdAt: string | null;
  processedAt: string | null;
}

interface OrderEvent {
  createdAt?: unknown;
  status?: string;
  createdBy?: string;
  note?: string | null;
  type?: string;
}

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && '_seconds' in val) return new Date((val as { _seconds: number })._seconds * 1000);
  if (typeof val === 'object' && val !== null && 'seconds' in val) return new Date((val as { seconds: number }).seconds * 1000);
  const d = new Date(val as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIST(val: unknown): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The production journey shown as a compact progress line. Each step lists the statuses that mean "here". */
const JOURNEY: { label: string; statuses: OrderStatus[] }[] = [
  { label: 'Order placed', statuses: ['pending_payment'] },
  { label: 'Payment confirmed', statuses: ['paid', 'payment_confirmed'] },
  { label: 'Photo check', statuses: ['photo_validation'] },
  { label: 'Rendering', statuses: ['print_rendering'] },
  { label: 'Print ready', statuses: ['print_ready'] },
  { label: 'In production', statuses: ['in_production', 'rework'] },
  { label: 'Quality check', statuses: ['quality_check'] },
  { label: 'Packed', statuses: ['packed', 'printed_packed'] },
  { label: 'Shipped', statuses: ['shipped'] },
  { label: 'Delivered', statuses: ['delivered', 'replacement_issued'] },
];
const stepOf = (status: string) => JOURNEY.findIndex((s) => (s.statuses as string[]).includes(status));

const card = 'rounded-card border border-line bg-paper p-4 sm:p-5';
const cardTitle = 'text-sm font-semibold text-ink';
const softBtn = 'rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint disabled:opacity-40';
const input = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none';

/** Item thumbnail: the customer's own preview when one is saved, else the product's catalogue picture. */
function ItemThumb({ orderId, item, fallback }: { orderId: string; item: OrderItem; fallback: string | null }) {
  const { user } = useAuth();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!user || !item.previewPath || !item.id) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/orders/${orderId}/items/${item.id}/download?type=preview`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => null);
        if (live && res.ok && typeof body?.url === 'string') setSrc(body.url);
      } catch {
        /* the fallback picture stays */
      }
    })();
    return () => { live = false; };
  }, [user, orderId, item.id, item.previewPath]);
  return <ProductThumb src={src ?? fallback} alt={item.title} size={64} />;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => showToast(`${label} copied`, 'success'),
          () => showToast('Could not copy', 'error')
        );
      }}
      className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink/75 hover:bg-tint hover:text-ink"
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      Copy
    </button>
  );
}

export default function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const { id: orderId } = use(params);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [customizations, setCustomizations] = useState<unknown[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [canSeeCustomers, setCanSeeCustomers] = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [hasRedDpi, setHasRedDpi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [advanceNote, setAdvanceNote] = useState('');
  const [courierInput, setCourierInput] = useState('');
  const [awbInput, setAwbInput] = useState('');
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [couriers, setCouriers] = useState<string[]>([]);

  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState('');
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const fetchOrderDetails = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load order details');
      const data = await res.json();
      setOrder(data.order);
      setItems(data.items || []);
      setEvents(data.events || []);
      setCustomizations(data.customizations || []);
      setRefunds(data.refunds || []);
      setProductImages(data.productImages || {});
      setCanSeeCustomers(Boolean(data.canSeeCustomers));
      setCustomerEmail(data.customerEmail ?? null);
      setHasRedDpi(Boolean(data.hasRedDpi));
      setNotesText(data.order.notes || '');
      setTrackingUrl(data.order.shipmentTracking?.trackingUrl || '');
      setLoadError(false);
    } catch {
      setLoadError(true);
      showToast('Error loading order details', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, orderId, showToast]);

  useEffect(() => {
    void fetchOrderDetails();
  }, [fetchOrderDetails]);

  // Saved couriers, offered when marking the order shipped (their tracking link is then added automatically).
  useEffect(() => {
    if (!user || nextStatus !== 'shipped' || couriers.length) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/delivery/couriers', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = (await res.json()) as { couriers?: { name: string; isActive?: boolean }[] };
        setCouriers((body.couriers ?? []).filter((c) => c.isActive !== false).map((c) => c.name));
      } catch {
        /* typing the courier still works */
      }
    })();
  }, [user, nextStatus, couriers.length]);

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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          note: advanceNote.trim() || undefined,
          courier: nextStatus === 'shipped' ? courierInput.trim() || undefined : undefined,
          awbNumber: nextStatus === 'shipped' ? awbInput.trim() || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'The status could not be changed.');
      }
      showToast(`Order #${order.orderNo} is now ${statusLabel(nextStatus).toLowerCase()}`, 'success');
      setNextStatus('');
      setAdvanceNote('');
      void fetchOrderDetails();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'The status could not be changed.', 'error');
    } finally {
      setIsAdvancing(false);
      setConfirmAdvance(false);
    }
  };

  // Moves that can't be quietly undone (or notify the customer) ask first.
  const requiresConfirmation = nextStatus === 'cancelled' || nextStatus === 'shipped' || nextStatus === 'delivered';

  const handleSaveNotes = async () => {
    if (!user) return;
    setIsSavingNotes(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      });
      if (!res.ok) throw new Error();
      showToast('Notes saved', 'success');
      void fetchOrderDetails();
    } catch {
      showToast('The notes could not be saved.', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveTracking = async () => {
    if (!user) return;
    setIsSavingTracking(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/shipping`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.issues?.[0]?.message ?? body?.error?.message ?? 'The tracking link could not be saved.');
      }
      showToast('Tracking link saved', 'success');
      void fetchOrderDetails();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The tracking link could not be saved.', 'error');
    } finally {
      setIsSavingTracking(false);
    }
  };

  const handleResendNotification = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/resend-notification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order_confirmed' }),
      });
      if (!res.ok) throw new Error();
      showToast('Order confirmation sent to the customer again', 'success');
      void fetchOrderDetails();
    } catch {
      showToast('The message could not be sent.', 'error');
    }
  };

  // Who made each change: 'system' / 'system_*' for automatic steps, the customer's uid for their own actions,
  // anyone else is a staff member.
  const describeActor = (createdBy: string | undefined, customerUid: string | undefined): string => {
    if (!createdBy || createdBy === 'system' || createdBy.startsWith('system_')) return 'System';
    if (customerUid && createdBy === customerUid) return 'Customer';
    return `Staff ${createdBy.slice(0, 8)}`;
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 md:px-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-tint" />
        <div className="h-64 w-full animate-pulse rounded-card bg-tint" />
      </div>
    );
  }
  if (!order || loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="font-semibold text-ink">This order could not be opened.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button onClick={() => { setLoading(true); void fetchOrderDetails(); }} className={softBtn}>Try again</button>
          <Link href="/admin/orders" className={softBtn}>Back to orders</Link>
        </div>
      </div>
    );
  }

  const address = order.addressJson as {
    recipientName?: string | null;
    phone?: string;
    line1?: string;
    line2?: string | null;
    deliveryInstructions?: string | null;
    city?: string;
    state?: string;
    pincode?: string;
  } | undefined;
  const fullAddress = [address?.line1, address?.line2, `${address?.city ?? ''}, ${address?.state ?? ''} - ${address?.pincode ?? ''}`].filter(Boolean).join(', ');

  const refundedAmount = refunds.filter((r) => r.status === 'processed').reduce((s, r) => s + r.amount, 0);
  const pay = paymentState({ status: order.status, paymentStatus: order.paymentStatus, refundedAmount, total: order.total });
  const isTest = order.paymentProvider === 'mock';
  const failure = (order as unknown as { paymentFailure?: { reason?: string; at?: string; razorpayPaymentId?: string } }).paymentFailure;

  // Only the transitions the order state machine allows from here (the server enforces the same table). Refunds go
  // through the refund flow, not this list.
  const advanceOptions = allowedTransitionsFrom(order.status).filter((status) => status !== 'refunded' && status !== 'replacement_issued');
  const currentStep = stepOf(order.status);
  const closed = order.status === 'cancelled' || order.status === 'refunded';
  // The furthest step reached, for a cancelled/refunded order (from its history).
  const reachedStep = closed ? Math.max(0, ...events.map((e) => (e.status ? stepOf(e.status) : -1))) : currentStep;
  const stepTime = (i: number) => {
    const ev = events.find((e) => e.status && (JOURNEY[i].statuses as string[]).includes(e.status));
    return ev ? formatIST(ev.createdAt) : null;
  };
  const canRefund = pay === 'paid' || (pay === 'refunded' && refundedAmount < order.total && order.status !== 'refunded');

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <header className="space-y-3">
        <nav className="flex items-center gap-1.5 text-xs text-ink/55" aria-label="Breadcrumb">
          <Link href="/admin/orders" className="hover:text-gold-deep">Orders</Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">#{order.orderNo}</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Order #{order.orderNo}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <PaymentBadge state={pay} />
              <StatusChip status={order.status} size="sm" />
              {isTest && <span className="rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-xs font-medium text-ink">Test payment</span>}
              {hasRedDpi && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Photo too small: check before printing</span>}
              {order.hasGlitter && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Glitter finish</span>}
            </div>
            <p className="text-sm text-ink/60">
              Placed {formatIST(order.placedAt)} · <span className="font-semibold text-ink">{formatPaise(order.total)}</span>
              {order.paymentMode === 'partial_cod' && ` · ${formatPaise(order.amountDueOnDelivery)} to collect on delivery`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSeeCustomers && order.userId && <Link href={`/admin/customers/${order.userId}`} className={softBtn}>View customer</Link>}
            <button type="button" onClick={() => void handleResendNotification()} className={softBtn}>Resend confirmation</button>
            {canRefund && (
              <button type="button" onClick={() => setShowRefundModal(true)} className="rounded-full border border-red-200 px-3.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                Issue refund
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className={`${card} overflow-x-auto`} aria-label="Order progress">
          {closed && (
            <p className="mb-3 text-sm font-medium text-ink">
              This order was {order.status === 'cancelled' ? 'cancelled' : 'refunded'}{reachedStep > 0 ? ` after "${JOURNEY[reachedStep].label}"` : ''}.
            </p>
          )}
          <ol className="flex min-w-[720px] items-start">
            {JOURNEY.map((step, i) => {
              const done = i < reachedStep || (i === reachedStep && closed) || order.status === 'delivered';
              const current = !closed && i === currentStep && order.status !== 'delivered';
              const t = stepTime(i);
              return (
                <li key={step.label} className="relative flex flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                  {i > 0 && <span className={`absolute right-1/2 top-[9px] h-0.5 w-full ${i <= reachedStep && !(closed && i > reachedStep) ? 'bg-ink/70' : 'bg-line'}`} aria-hidden="true" />}
                  <span
                    className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      current ? 'border-gold bg-gold' : done ? (closed ? 'border-ink/40 bg-ink/40' : 'border-ink bg-ink') : 'border-line bg-paper'
                    }`}
                  >
                    {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </span>
                  <span className={`mt-1.5 px-1 text-[11px] leading-tight ${current ? 'font-semibold text-ink' : done ? 'text-ink/80' : 'text-ink/45'}`}>{step.label}</span>
                  {t && (done || current) && <span className="mt-0.5 text-[10px] text-ink/45">{t.replace(/, \d{4},/, ',')}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Main column */}
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-8">
          {/* Order summary */}
          <section className={card} aria-labelledby="sum-h">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="sum-h" className={cardTitle}>Order summary · {items.length} item{items.length === 1 ? '' : 's'}</h2>
              <button type="button" onClick={() => void downloadAllFiles()} disabled={downloadingZip} className="rounded-full bg-gold px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-gold-deep disabled:opacity-50">
                {downloadingZip ? 'Preparing zip…' : 'Download all files (zip)'}
              </button>
            </div>

            <div className="divide-y divide-line">
              {groupOrderItems(items, order.combos).flatMap((group) =>
                group.kind === 'item'
                  ? [{ item: group.item, idx: group.index, head: null, frameLabel: null as string | null }]
                  : group.frames.map((frame, n) => ({ item: frame.item, idx: frame.index, head: n === 0 ? group : null, frameLabel: frame.label as string | null }))
              ).map(({ item, idx, head, frameLabel }) => (
                <Fragment key={item.id || idx}>
                  {head && (
                    <div className="mt-3 rounded-xl bg-tint px-3 py-2 text-sm" data-testid="admin-order-combo">
                      <span className="font-semibold text-ink">Combo offer: {head.name}</span>
                      <span className="text-ink/70"> · {head.frames.length} frames{head.price !== null ? ` · ${formatPaise(head.price)} paid for the set` : ''}</span>
                    </div>
                  )}
                  <div className={`py-4 ${frameLabel ? 'border-l-2 border-gold/60 pl-3' : ''}`}>
                    <div className="flex items-start gap-3">
                      <ItemThumb orderId={orderId} item={item} fallback={productImages[item.productId] ?? null} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-ink">{frameLabel ? `${frameLabel} · ` : ''}{item.title}</h3>
                          <span className="shrink-0 font-semibold text-ink tabular-nums">{formatPaise(item.unitPrice * item.qty)}</span>
                        </div>
                        {(item.sizeLabel || item.frameColour || item.material) && (
                          <p className="text-sm text-ink/70">
                            {[item.sizeLabel, item.material, item.frameColour].filter(Boolean).join(' · ')}
                            {item.sku ? <span className="font-mono text-xs text-ink/40"> · {item.sku}</span> : null}
                          </p>
                        )}
                        <p className="text-sm text-ink/60">
                          Qty: <strong className="text-ink">{item.qty}</strong> × {formatPaise(item.unitPrice)}
                          {frameLabel ? ' (share of the combo price)' : ''}
                          {item.finish === 'glitter' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Glitter finish{item.finishExtra ? ` +${formatPaise(item.finishExtra)}` : ''}</span>}
                        </p>
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

            {customizations.length > 0 && (
              <details className="mt-2 border-t border-line pt-3 text-sm">
                <summary className="cursor-pointer text-ink/70 hover:text-ink">Older photo records ({customizations.length})</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {customizations.map((cust: unknown, idx) => {
                    const c = cust as { personalizationId: string; originalPhotoUrl?: string; previewUrl?: string; printUrl?: string; dpiScore?: number; dpiBand?: 'green' | 'yellow' | 'red'; textInputs?: Record<string, string> };
                    return (
                      <div key={c.personalizationId || idx} className="space-y-2 rounded-xl border border-line bg-field/40 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">Item {idx + 1}</span>
                          {c.dpiBand && (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${c.dpiBand === 'green' ? 'bg-emerald-50 text-emerald-800' : c.dpiBand === 'yellow' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                              {c.dpiScore ? `${c.dpiScore} DPI` : 'DPI'} · {c.dpiBand === 'green' ? 'good' : c.dpiBand === 'yellow' ? 'acceptable' : 'too low'}
                            </span>
                          )}
                        </div>
                        {c.textInputs && Object.entries(c.textInputs).map(([k, v]) => (
                          <p key={k} className="text-ink/70"><span className="text-ink/45">{k}:</span> <span className="text-ink">{v}</span></p>
                        ))}
                        <div className="flex flex-wrap gap-1.5">
                          {c.originalPhotoUrl && <a href={c.originalPhotoUrl} target="_blank" rel="noreferrer" download className="rounded-full border border-line bg-paper px-2.5 py-1 text-ink hover:bg-tint">Original photo</a>}
                          {c.previewUrl && <a href={c.previewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-paper px-2.5 py-1 text-ink hover:bg-tint">Preview</a>}
                          {c.printUrl && <a href={c.printUrl} target="_blank" rel="noreferrer" download className="rounded-full bg-gold px-2.5 py-1 font-medium text-ink">300 DPI print file</a>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between text-ink/70"><dt>Subtotal</dt><dd className="tabular-nums text-ink">{formatPaise(order.subtotal)}</dd></div>
              {order.discount > 0 && <div className="flex justify-between text-ink/70"><dt>Discount{order.couponId ? ` (${order.couponId})` : ''}</dt><dd className="tabular-nums text-emerald-700">−{formatPaise(order.discount)}</dd></div>}
              <div className="flex justify-between text-ink/70">
                <dt>Delivery</dt>
                <dd className="tabular-nums text-ink">{order.shipping ? formatPaise(order.shipping) : 'Free'}</dd>
              </div>
              {order.shippingDetail && (
                <p className="text-right text-xs text-ink/50">
                  {{
                    home_state_free: 'Free: delivered within the home state',
                    state_charge: 'Charge set for this state',
                    other_states_default: 'Fallback charge for states without their own',
                    express_charge: 'Express delivery charge',
                    coupon_waived: 'Waived by a free-shipping coupon',
                  }[order.shippingDetail.basis]}{' '}
                  ({order.shippingDetail.state} {order.shippingDetail.pincode})
                </p>
              )}
              {order.shippingDetail?.pinAmbiguous && (
                <p className="text-right text-xs text-alert">This PIN is in a range shared with Puducherry and is not in your PIN list: check the address really is in {order.shippingDetail.state} before dispatch.</p>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><dt>Total</dt><dd className="tabular-nums">{formatPaise(order.total)}</dd></div>
            </dl>
          </section>

          {/* Shipping */}
          <section className={card} aria-labelledby="ship-h">
            <h2 id="ship-h" className={cardTitle}>Shipping</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-field px-3 py-2"><dt className="text-xs text-ink/55">Courier</dt><dd className="font-medium text-ink">{order.courier || 'Not shipped yet'}</dd></div>
              <div className="rounded-xl bg-field px-3 py-2"><dt className="text-xs text-ink/55">AWB number</dt><dd className="font-mono text-ink">{order.awbNumber || '—'}</dd></div>
            </dl>
            <label className="mt-3 block space-y-1">
              <span className="text-sm font-medium text-ink">Tracking link for the customer</span>
              <div className="flex gap-2">
                <input type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://www.delhivery.com/track/package/…" className={`${input} font-mono text-xs`} />
                <button type="button" onClick={() => void handleSaveTracking()} disabled={isSavingTracking || !trackingUrl.trim()} className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/85 disabled:opacity-40">
                  {isSavingTracking ? 'Saving…' : 'Save link'}
                </button>
              </div>
              <span className="block text-xs text-ink/50">Filled in automatically when the courier is saved under Delivery → Courier partners.</span>
            </label>
          </section>

          {/* Notes */}
          <section className={card} aria-labelledby="notes-h">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="notes-h" className={cardTitle}>Staff notes</h2>
              <span className="text-xs text-ink/45">Customers never see these</span>
            </div>
            <textarea rows={3} value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Production instructions, phone call notes, packing requests…" className={`${input} mt-3`} />
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={() => void handleSaveNotes()} disabled={isSavingNotes} className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-ink hover:bg-gold-deep disabled:opacity-50">
                {isSavingNotes ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </section>
        </div>

        {/* Side column */}
        <aside className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-6 lg:col-span-4">
          {/* Next step */}
          <section className={`${card} border-ink/20`} aria-labelledby="next-h">
            <h2 id="next-h" className={cardTitle}>Next step</h2>
            {advanceOptions.length === 0 ? (
              <p className="mt-2 text-sm text-ink/60">This order is {statusLabel(order.status).toLowerCase()} — no further status changes are available.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-ink/55">Now: <span className="font-medium text-ink">{statusLabel(order.status)}</span>. Only the steps allowed from here are listed.</p>
                <FormField label="Move to" required>
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus)} className={input}>
                    <option value="">Choose the next step</option>
                    {advanceOptions.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </FormField>

                {nextStatus === 'shipped' && (
                  <div className="space-y-3 rounded-xl bg-field p-3">
                    <FormField label="Courier" required>
                      <input type="text" list="saved-couriers" value={courierInput} onChange={(e) => setCourierInput(e.target.value)} placeholder="Delhivery / DTDC / India Post" className={input} />
                    </FormField>
                    <datalist id="saved-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
                    <FormField label="AWB number" required>
                      <input type="text" value={awbInput} onChange={(e) => setAwbInput(e.target.value)} placeholder="AWB123456789" className={`${input} font-mono`} />
                    </FormField>
                  </div>
                )}

                <FormField label="Note (optional)">
                  <input type="text" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="Saved in the order history" className={input} />
                </FormField>

                <button
                  type="button"
                  onClick={() => (requiresConfirmation ? setConfirmAdvance(true) : void handleAdvanceStatus())}
                  disabled={!nextStatus || isAdvancing || (nextStatus === 'shipped' && (!courierInput.trim() || !awbInput.trim()))}
                  className="w-full rounded-full bg-gold py-2.5 text-sm font-semibold text-ink hover:bg-gold-deep disabled:opacity-40"
                >
                  {isAdvancing ? 'Saving…' : nextStatus ? `Mark as ${statusLabel(nextStatus).toLowerCase()}` : 'Update status'}
                </button>
              </div>
            )}
          </section>

          {/* Payment */}
          <section className={card} aria-labelledby="pay-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="pay-h" className={cardTitle}>Payment</h2>
              <PaymentBadge state={pay} size="sm" />
            </div>
            {isTest && (
              <p role="status" className="mt-3 rounded-xl border border-gold/50 bg-gold/15 px-3 py-2 text-xs text-ink">
                <strong>Test payment</strong> — this order went through the mock payment provider. No money was collected.
              </p>
            )}
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink/60">Amount</dt><dd className="font-semibold text-ink tabular-nums">{formatPaise(order.total)}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/60">Method</dt>
                <dd className="text-right text-ink">{order.paymentMode === 'partial_cod' ? `Advance online ${formatPaise(order.amountPaidOnline)}, ${formatPaise(order.amountDueOnDelivery)} on delivery` : 'Paid in full online'}</dd>
              </div>
              <div className="flex justify-between gap-3"><dt className="text-ink/60">Gateway</dt><dd className="text-ink">{isTest ? 'Test system' : order.paymentProvider === 'razorpay' ? 'Razorpay' : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/60">Transaction ID</dt><dd className="truncate font-mono text-xs text-ink">{order.razorpayPaymentId || '—'}</dd></div>
              {order.razorpayOrderId && <div className="flex justify-between gap-3"><dt className="text-ink/60">Razorpay order</dt><dd className="truncate font-mono text-xs text-ink/70">{order.razorpayOrderId}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-ink/60">Invoice</dt><dd className="font-mono text-xs text-ink">{order.invoiceNo || 'After payment'}</dd></div>
            </dl>
            {pay === 'failed' && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
                {failure?.reason ? `Razorpay: ${failure.reason}` : 'Razorpay reported this payment as failed. The reason was not saved for this order; check with Razorpay below.'}
                {failure?.at && <span className="block text-red-700/80">Failed {formatIST(failure.at)}</span>}
              </p>
            )}
            {refunds.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs font-semibold text-ink">Refunds</p>
                <ul className="mt-1.5 space-y-1.5 text-xs text-ink/75">
                  {refunds.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium text-ink">{formatPaise(r.amount)}</span> · {r.status === 'processed' ? 'refunded' : r.status === 'failed' ? 'failed' : 'in progress'}
                      {r.processedAt || r.createdAt ? ` · ${formatIST(r.processedAt ?? r.createdAt)}` : ''}
                      {r.reason && <span className="block text-ink/55">{r.reason}</span>}
                      {r.failureReason && <span className="block text-alert">{r.failureReason}</span>}
                      {r.razorpayRefundId && <span className="block font-mono text-[11px] text-ink/45">{r.razorpayRefundId}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(pay === 'failed' || pay === 'pending') && !isTest && (
              <div className="mt-3 border-t border-line pt-3"><PaymentCheck orderId={order.id} /></div>
            )}
          </section>

          {/* Customer */}
          <section className={card} aria-labelledby="cust-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="cust-h" className={cardTitle}>Customer & delivery address</h2>
              {canSeeCustomers && order.userId && <Link href={`/admin/customers/${order.userId}`} className="text-xs font-semibold text-gold-deep hover:underline">Profile</Link>}
            </div>
            <div className="mt-3 space-y-2.5 text-sm">
              <div>
                <p className="font-semibold text-ink">{address?.recipientName || order.customerName || 'Customer'}</p>
                {address?.recipientName && order.customerName && address.recipientName !== order.customerName && (
                  <p className="text-xs text-ink/55">Gift — ordered by {order.customerName}</p>
                )}
              </div>
              {address?.phone && (
                <div className="flex items-center justify-between gap-2">
                  <a href={`tel:${address.phone}`} className="font-mono text-ink hover:text-gold-deep">{address.phone}</a>
                  <CopyButton text={address.phone} label="Phone" />
                </div>
              )}
              {customerEmail && (
                <div className="flex items-center justify-between gap-2">
                  <a href={`mailto:${customerEmail}`} className="truncate text-ink hover:text-gold-deep">{customerEmail}</a>
                  <CopyButton text={customerEmail} label="Email" />
                </div>
              )}
              <div className="flex items-start justify-between gap-2 border-t border-line pt-2.5">
                <p className="text-ink/80">
                  {address?.line1}{address?.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address?.city}, {address?.state} - {address?.pincode}
                </p>
                <CopyButton text={`${address?.recipientName || order.customerName || ''}\n${fullAddress}\n${address?.phone ?? ''}`.trim()} label="Address" />
              </div>
              {address?.deliveryInstructions && (
                <p className="text-ink/70"><strong className="font-medium text-ink">Delivery note:</strong> {address.deliveryInstructions}</p>
              )}
            </div>
          </section>

          {/* History */}
          <section className={card} aria-labelledby="hist-h">
            <h2 id="hist-h" className={cardTitle}>History</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-ink/55">No changes recorded yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {[...events].reverse().map((e, i) => (
                  <li key={i} className="relative pl-5 text-sm">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-ink/40" aria-hidden="true" />
                    <p className="text-ink">{e.status ? statusLabel(e.status as OrderStatus) : (e.type || 'Order updated').replace(/_/g, ' ')}</p>
                    <p className="text-xs text-ink/50">{formatIST(e.createdAt)} · By {describeActor(e.createdBy, order.userId)}</p>
                    {e.note && <p className="mt-0.5 text-xs text-ink/70">{e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmAdvance}
        title={nextStatus ? `Mark order as ${statusLabel(nextStatus)}?` : 'Change order status?'}
        message={
          nextStatus === 'cancelled'
            ? `This cancels order #${order.orderNo}. It can't be undone, and the customer is notified.`
            : nextStatus === 'shipped'
              ? `The customer is told order #${order.orderNo} is on its way with ${courierInput.trim() || 'the courier'} (AWB ${awbInput.trim() || '—'}). This can't be undone.`
              : `The customer is notified that order #${order.orderNo} is ${nextStatus ? statusLabel(nextStatus).toLowerCase() : 'updated'}. This can't be undone.`
        }
        confirmLabel={nextStatus ? `Yes, mark ${statusLabel(nextStatus).toLowerCase()}` : 'Confirm'}
        tone={nextStatus === 'cancelled' ? 'danger' : 'default'}
        isLoading={isAdvancing}
        onConfirm={handleAdvanceStatus}
        onCancel={() => setConfirmAdvance(false)}
      />

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
