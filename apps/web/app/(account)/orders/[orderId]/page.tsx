'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import { OrderStatusTimeline } from '../../../../components/orders/OrderStatusTimeline';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { useToast } from '../../../../components/ui/Toast';
import { PageSkeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { getFirestore, doc, getDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../../lib/auth-context';
import { useCart } from '../../../../lib/cart-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { getOrCreateSessionId } from '../../../../lib/session-id';
import type { Order, OrderItem, OrderEvent, Return, ReturnStatus, ReturnReasonCategory } from '@bro-pics/shared';

const RETURN_REASON_CATEGORY_LABEL: Record<ReturnReasonCategory, string> = {
  damaged: 'Arrived damaged',
  wrong_item: 'Wrong item received',
  quality: 'Quality not as expected',
  changed_mind: 'Changed my mind',
  other: 'Other',
};

const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: 'Return requested',
  approved: 'Return approved',
  rejected: 'Return rejected',
  pickup_scheduled: 'Pickup scheduled',
  picked_up: 'Picked up',
  refund_processing: 'Refund processing',
  refunded: 'Refunded',
};

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

// Cancellation is only offered while an order hasn't reached the point of
// no real-world return — matches the server-side check in
// /api/orders/[orderId]/cancel exactly, so the button never offers
// something the API would then reject.
const CANCELLABLE_STATUSES = new Set(['pending_payment', 'paid', 'in_production']);

// order.placedAt comes back from the client Firestore SDK as a Timestamp
// object (with a toDate() method), not a plain Date or ISO string, so this
// duck-types rather than assuming a specific shape.
function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPlacedAt(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString('en-IN');
  }
  if (value instanceof Date) return value.toLocaleString('en-IN');
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('en-IN');
  }
  return '';
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { addItem } = useCart();
  const uid = user?.uid;
  const [reorderingKey, setReorderingKey] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [productSlugs, setProductSlugs] = useState<Map<string, string>>(new Map());
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [existingReturn, setExistingReturn] = useState<Return | null>(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReasonCategory, setReturnReasonCategory] = useState<ReturnReasonCategory>('damaged');
  const [returnReason, setReturnReason] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  // [FE-23]
  const [returnPreferredResolution, setReturnPreferredResolution] = useState<'refund' | 'replacement'>('refund');
  const [returnEvidenceFile, setReturnEvidenceFile] = useState<File | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  // [FE-01] Distinct from "still loading" — a genuinely missing order (a
  // stale/mistyped link) or a failed read (offline, permission-denied)
  // both used to leave `order` at null forever, showing an infinite
  // skeleton with no way out.
  const [orderNotFound, setOrderNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    params.then((p) => setOrderId(p.orderId));
  }, [params]);

  useEffect(() => {
    if (!uid || !orderId) return;
    const db = getFirestore(getFirebaseApp());

    getDoc(doc(db, 'orders', orderId))
      .then((snapshot) => {
        if (snapshot.exists()) {
          setOrder(snapshot.data() as Order);
        } else {
          setOrderNotFound(true);
        }
      })
      .catch(() => setLoadError(true));
    getDocs(collection(db, 'orders', orderId, 'items')).then(async (snapshot) => {
      const loadedItems = snapshot.docs.map((d) => d.data() as OrderItem);
      setItems(loadedItems);

      // "Personalize again" needs each item's product SLUG, but OrderItem
      // only stores productId (the product route is slug-based) — fetched
      // once per distinct product here rather than denormalizing the slug
      // onto every order item.
      const uniqueProductIds = [...new Set(loadedItems.map((item) => item.productId).filter(Boolean))];
      const entries = await Promise.all(
        uniqueProductIds.map(async (productId) => {
          const productSnap = await getDoc(doc(db, 'products', productId));
          return [productId, productSnap.exists() ? (productSnap.data() as { slug?: string }).slug ?? null : null] as const;
        })
      );
      setProductSlugs(new Map(entries.filter((e): e is [string, string] => e[1] !== null)));
    });
    getDocs(query(collection(db, 'orders', orderId, 'events'), orderBy('createdAt', 'asc'))).then((snapshot) => {
      setEvents(snapshot.docs.map((d) => d.data() as OrderEvent));
    });
  }, [uid, orderId]);

  // Returns live in a top-level `returns` collection unreachable by direct
  // client reads (deny-by-default, same as every other new collection this
  // round) — fetched through the admin-backed route instead. Only ever
  // relevant once delivered, so gated on that rather than firing for
  // every order regardless of status. Depends on `uid` (a stable
  // primitive), not the whole `user` object — same fix as AddressesPage's
  // own effect: the Firebase User object is a fresh reference on every
  // AuthProvider re-render, so depending on it directly would refire this
  // on every render (and, worse here, stomp a just-submitted return back
  // to null on the very next render after POSTing it).
  useEffect(() => {
    if (!user || !uid || !orderId || order?.status !== 'delivered') return;
    (async () => {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/orders/${orderId}/returns`, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!response.ok) return;
      const body = await response.json();
      setExistingReturn(body.returns?.[0] ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, orderId, order?.status]);

  if (!user) return <SignedOutNotice action="see this order" />;
  if (orderNotFound) {
    return (
      <EmptyState
        title="Order not found"
        message="This order doesn't exist, or isn't linked to your account."
        action={
          <Link href="/orders" className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors">
            Back to orders
          </Link>
        }
      />
    );
  }
  if (loadError) {
    return (
      <EmptyState
        title="Could not load this order"
        message="Check your connection and try again."
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors"
          >
            Try again
          </button>
        }
      />
    );
  }
  if (!order) return <PageSkeleton rows={2} />;

  const hasPendingPaymentEvent = events.some((event) => event.status === 'pending_payment');
  const isCancellable = CANCELLABLE_STATUSES.has(order.status);

  const handleCancel = async () => {
    if (!orderId || !user) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        setCancelError('Could not cancel this order. Try again.');
        showToast('Could not cancel this order. Try again.', 'error');
        return;
      }
      setOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
      setShowCancelConfirm(false);
      showToast('Order cancelled', 'success');
    } finally {
      setIsCancelling(false);
    }
  };

  // [FE-24] Copies the item's stored personalization into a fresh draft
  // (see POST /api/customizations/reorder for why it can't just reuse the
  // original personalizationId — that one is locked to the order it was
  // actually placed under) and adds it as a new cart line, so "reorder"
  // never means re-uploading or re-personalizing anything.
  const handleReorder = async (item: OrderItem, index: number) => {
    if (!orderId || !user) return;
    const key = `${item.personalizationId}-${index}`;
    setReorderingKey(key);
    try {
      const idToken = await user.getIdToken();
      const sessionId = getOrCreateSessionId();
      const response = await fetch('/api/customizations/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify({ personalizationId: item.personalizationId }),
      });
      if (!response.ok) {
        showToast('Could not reorder this item. Try again.', 'error');
        return;
      }
      const body = await response.json();
      addItem({
        variantId: item.variantId,
        personalizationId: body.personalizationId,
        title: item.title,
        unitPriceSnapshot: item.unitPrice,
        qty: item.qty,
        ...(item.previewPath && { previewPath: item.previewPath }),
        ...(productSlugs.get(item.productId) && { productSlug: productSlugs.get(item.productId) }),
      });
      showToast('Added to cart', 'success');
    } finally {
      setReorderingKey(null);
    }
  };

  const handleRequestReturn = async () => {
    if (!orderId || !user || !returnReason.trim()) return;
    // [FE-23] A damage claim needs at least one evidence photo — matches
    // the server's own requirement (POST /api/orders/[orderId]/returns),
    // checked here too so the customer sees why before submitting, not
    // just a generic 400 back.
    if (returnReasonCategory === 'damaged' && !returnEvidenceFile) {
      setReturnError('Please attach at least one photo of the damage.');
      return;
    }
    setIsSubmittingReturn(true);
    setReturnError(null);
    try {
      const idToken = await user.getIdToken();
      let evidencePaths: string[] = [];
      if (returnEvidenceFile) {
        setIsUploadingEvidence(true);
        try {
          const formData = new FormData();
          formData.set('file', returnEvidenceFile);
          const evidenceRes = await fetch(`/api/orders/${orderId}/returns/evidence`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: formData,
          });
          if (!evidenceRes.ok) {
            setReturnError('Could not upload the evidence photo — please try again.');
            return;
          }
          const evidenceBody = await evidenceRes.json();
          evidencePaths = [evidenceBody.path];
        } finally {
          setIsUploadingEvidence(false);
        }
      }
      const response = await fetch(`/api/orders/${orderId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          reasonCategory: returnReasonCategory,
          reason: returnReason.trim(),
          preferredResolution: returnPreferredResolution,
          ...(evidencePaths.length > 0 && { evidencePaths }),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error ?? 'Could not submit your return request. Try again.';
        setReturnError(message);
        showToast(message, 'error');
        return;
      }
      const body = await response.json();
      setExistingReturn(body.return);
      setShowReturnForm(false);
      showToast('Return requested', 'success');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <Link href="/orders" className="hover:text-ink">My orders</Link>
        {' / '}
        <span className="text-ink font-medium">Order tracking</span>
      </nav>

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Your memories are in good hands.</h1>
          <p className="text-xs text-ink/60">
            Order {order.orderNo} · Placed {formatPlacedAt(order.placedAt)} · Paid ₹{formatPaise(order.total)}
          </p>
        </div>
        <Link
          href={`/orders/${orderId}/invoice`}
          className="px-5 py-2.5 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors w-fit"
        >
          View invoice
        </Link>
      </div>

      {/* Milestone Progress Card */}
      <div className="rounded-3xl bg-paper border border-line p-6 md:p-8 mb-8 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="font-display text-xl font-bold text-ink">
            {order.status === 'delivered'
              ? 'Your frame has arrived.'
              : order.status === 'shipped'
              ? 'Your frame is on its way.'
              : order.status === 'in_production'
              ? 'Your frame is being handcrafted.'
              : "We're checking your photos"}
          </h2>
          <span className="px-3 py-1 rounded-full border border-line bg-field text-xs font-semibold text-ink">
            {order.status === 'paid' ? 'Payment confirmed' : order.status === 'in_production' ? 'In production' : order.status === 'shipped' ? 'Shipped' : order.status === 'delivered' ? 'Delivered' : order.status === 'cancelled' ? 'Cancelled' : 'Pending payment'}
          </span>
        </div>

        <p className="text-xs text-ink/70 font-medium mb-6">
          Estimated dispatch: 3-5 working days
        </p>

        {/* Milestone Steps Bar */}
        <div className="py-4 border-t border-line">
          <OrderStatusTimeline status={order.status} />
        </div>

        {order.shipmentTracking && (
          <div className="mt-4 pt-4 border-t border-line text-xs text-ink/80 flex items-center gap-2">
            <span>Tracking: {order.shipmentTracking.provider} — {order.shipmentTracking.awbNumber}</span>
            {order.shipmentTracking.trackingUrl && (
              <a
                href={order.shipmentTracking.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-semibold"
              >
                Track live →
              </a>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-line">
          <h3 className="text-xs font-semibold text-ink mb-2">Activity history</h3>
          <ul className="space-y-1 text-2xs text-ink/70">
            {!hasPendingPaymentEvent && (
              <li className="flex justify-between">
                <span>Order placed</span>
                <span>{formatPlacedAt(order.placedAt)}</span>
              </li>
            )}
            {events.map((ev, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {ev.status}
                  {ev.note ? ` — ${ev.note}` : ''}
                  {ev.courier && <span className="ml-2">{ev.courier}</span>}
                  {ev.awbNumber && <span className="ml-2">{ev.awbNumber}</span>}
                </span>
                <span>{formatPlacedAt(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Left: Items list & Actions */}
        <div className="space-y-6">
          <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-ink mb-4">Items in your order</h2>
            <ul className="divide-y divide-line">
              {items.map((item, i) => {
                const slug = productSlugs.get(item.productId);
                const key = `${item.personalizationId}-${i}`;
                return (
                  <li key={i} className="py-4 flex flex-col sm:flex-row gap-4 items-start justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-ink">{item.title}</h3>
                      <p className="text-xs text-ink/60 mt-0.5">Quantity: {item.qty} · ₹{formatPaise(item.unitPrice ?? 0)} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {order.status === 'delivered' && (
                        <button
                          type="button"
                          onClick={() => handleReorder(item, i)}
                          disabled={reorderingKey === key}
                          className="px-4 py-2 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {reorderingKey === key ? 'Adding…' : 'Reorder'}
                        </button>
                      )}
                      {slug && (
                        <Link
                          href={`/product/${slug}`}
                          className="px-4 py-2 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
                        >
                          Personalise again
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Cancellations & Returns */}
          {isCancellable && (
            <div className="p-6 rounded-3xl bg-field border border-line">
              <h3 className="font-display text-base font-bold text-ink mb-2">Need to cancel?</h3>
              <p className="text-xs text-ink/70 mb-4">
                You can cancel your order before custom crafting begins.
              </p>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-5 py-2.5 rounded-full border border-alert text-alert text-xs font-semibold hover:bg-alert hover:text-paper transition-colors"
              >
                Cancel order
              </button>
              {cancelError && <p className="text-xs text-alert mt-2">{cancelError}</p>}
              <ConfirmDialog
                isOpen={showCancelConfirm}
                title="Cancel this order?"
                message="This can't be undone. Your payment will be refunded to your original payment method."
                confirmLabel="Yes, cancel order"
                cancelLabel="Keep order"
                isLoading={isCancelling}
                onConfirm={handleCancel}
                onCancel={() => setShowCancelConfirm(false)}
              />
            </div>
          )}

          {order.status === 'delivered' && (
            <div className="p-6 rounded-3xl bg-field border border-line">
              <h3 className="font-display text-base font-bold text-ink mb-2">Returns & Exchanges</h3>
              {existingReturn ? (
                <div className="rounded-2xl border border-line bg-paper p-4 flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-ink">{RETURN_STATUS_LABEL[existingReturn.status]}</span>
                  <span className="text-ink/60">&ldquo;{existingReturn.reason}&rdquo;</span>
                </div>
              ) : showReturnForm ? (
                <div className="space-y-4 pt-2">
                  <div>
                    <label htmlFor="return-reason-category" className="block text-2xs font-semibold text-ink mb-1">
                      What&apos;s the issue?
                    </label>
                    <select
                      id="return-reason-category"
                      value={returnReasonCategory}
                      onChange={(e) => setReturnReasonCategory(e.target.value as ReturnReasonCategory)}
                      className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:outline-none"
                    >
                      {Object.entries(RETURN_REASON_CATEGORY_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="return-reason" className="block text-2xs font-semibold text-ink mb-1">
                      Tell us more
                    </label>
                    <textarea
                      id="return-reason"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:outline-none"
                    />
                  </div>

                  {returnReasonCategory === 'damaged' && (
                    <div>
                      <label htmlFor="return-evidence" className="block text-2xs font-semibold text-ink mb-1">
                        Photo of the damage (required)
                      </label>
                      <input
                        id="return-evidence"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setReturnEvidenceFile(e.target.files?.[0] ?? null)}
                        className="text-xs text-ink"
                      />
                    </div>
                  )}

                  <div className="flex gap-4 items-center">
                    <span className="text-2xs font-semibold text-ink">Resolution:</span>
                    <label className="text-xs text-ink flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="res"
                        checked={returnPreferredResolution === 'refund'}
                        onChange={() => setReturnPreferredResolution('refund')}
                      />
                      Refund
                    </label>
                    <label className="text-xs text-ink flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="res"
                        checked={returnPreferredResolution === 'replacement'}
                        onChange={() => setReturnPreferredResolution('replacement')}
                      />
                      Replacement
                    </label>
                  </div>

                  {returnError && <p className="text-xs text-alert">{returnError}</p>}

                  <div className="flex gap-3">
                    <button
                      onClick={handleRequestReturn}
                      disabled={isSubmittingReturn || isUploadingEvidence}
                      className="px-5 py-2.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {isUploadingEvidence ? 'Uploading…' : isSubmittingReturn ? 'Submitting…' : 'Submit return request'}
                    </button>
                    <button
                      onClick={() => setShowReturnForm(false)}
                      className="px-4 py-2.5 rounded-full border border-line bg-paper text-ink text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowReturnForm(true)}
                  className="px-5 py-2.5 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
                >
                  Return product
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Delivery Info Card */}
        <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm lg:sticky lg:top-32">
          <h2 className="font-display text-lg font-bold text-ink mb-4">Delivery to</h2>
          
          <div className="space-y-1 text-xs text-ink/80 mb-6">
            <p className="font-bold text-ink">{user.displayName || 'Customer'}</p>
            {user.phoneNumber && <p>{user.phoneNumber}</p>}
            {user.email && <p>{user.email}</p>}
          </div>

          <div className="pt-4 border-t border-line">
            <p className="text-xs text-ink/60 mb-3">
              Questions about your frame? We&apos;re here to help.
            </p>
            <a
              href="mailto:hello@bropics.in"
              className="block w-full py-2.5 rounded-full border border-line bg-paper hover:bg-tint text-ink text-center text-xs font-semibold transition-colors"
            >
              Contact support
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
