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
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-ink">Order {order.orderNo}</h1>
        <Link href={`/orders/${orderId}/invoice`} className="text-sm text-accent hover:text-accent-dark">
          View invoice
        </Link>
      </div>

      <OrderStatusTimeline status={order.status} />

      {order.shipmentTracking && (
        <div className="text-sm text-accent/80">
          {order.shipmentTracking.provider} — {order.shipmentTracking.awbNumber}
          {order.shipmentTracking.trackingUrl && (
            <>
              {' '}
              ·{' '}
              <a
                href={order.shipmentTracking.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-dark underline"
              >
                Track shipment
              </a>
            </>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2 text-accent/80">
        {items.map((item, i) => {
          const slug = productSlugs.get(item.productId);
          const key = `${item.personalizationId}-${i}`;
          return (
            <li key={i} className="flex items-center justify-between gap-3">
              <span>
                <span>{item.title}</span> × {item.qty}
              </span>
              <span className="flex items-center gap-3 whitespace-nowrap">
                {order.status === 'delivered' && (
                  <button
                    type="button"
                    onClick={() => handleReorder(item, i)}
                    disabled={reorderingKey === key}
                    className="text-sm text-accent hover:text-accent-dark disabled:opacity-50"
                  >
                    {reorderingKey === key ? 'Adding…' : 'Reorder'}
                  </button>
                )}
                {slug && (
                  <Link href={`/product/${slug}`} className="text-sm text-accent hover:text-accent-dark">
                    Personalize again
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {isCancellable && (
        <div className="pt-2">
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="rounded-md border border-alert text-alert px-4 py-2 text-sm font-semibold hover:bg-alert hover:text-paper transition-colors"
          >
            Cancel order
          </button>
          {cancelError && <p className="text-sm text-alert mt-2">{cancelError}</p>}
          <ConfirmDialog
            isOpen={showCancelConfirm}
            title="Cancel this order?"
            message="This can't be undone."
            confirmLabel="Yes, cancel order"
            cancelLabel="Keep order"
            isLoading={isCancelling}
            onConfirm={handleCancel}
            onCancel={() => setShowCancelConfirm(false)}
          />
        </div>
      )}

      {order.status === 'delivered' && (
        <div className="pt-2">
          {existingReturn ? (
            <div className="rounded-md border border-line p-4 flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink">{RETURN_STATUS_LABEL[existingReturn.status]}</span>
              <span className="text-sm text-ink/60">&ldquo;{existingReturn.reason}&rdquo;</span>
              {existingReturn.staffNote && <span className="text-sm text-ink/60">Note: {existingReturn.staffNote}</span>}
            </div>
          ) : showReturnForm ? (
            <div className="rounded-md border border-line p-4 flex flex-col gap-3">
              <label htmlFor="return-reason-category" className="text-sm font-medium text-ink">
                What's the issue?
              </label>
              <select
                id="return-reason-category"
                value={returnReasonCategory}
                onChange={(e) => setReturnReasonCategory(e.target.value as ReturnReasonCategory)}
                className="rounded-md border border-line px-3 py-2 text-sm text-ink"
              >
                {Object.entries(RETURN_REASON_CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="return-reason" className="text-sm font-medium text-ink">
                Tell us more
              </label>
              <textarea
                id="return-reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                rows={3}
                className="rounded-md border border-line px-3 py-2 text-sm text-ink"
              />

              {returnReasonCategory === 'damaged' && (
                <>
                  <label htmlFor="return-evidence" className="text-sm font-medium text-ink">
                    Photo of the damage (required)
                  </label>
                  <input
                    id="return-evidence"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReturnEvidenceFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-ink"
                  />
                  {returnEvidenceFile && <p className="text-xs text-ink/60">Selected: {returnEvidenceFile.name}</p>}
                </>
              )}

              <span className="text-sm font-medium text-ink">Preferred resolution</span>
              <div className="flex gap-4" role="radiogroup" aria-label="Preferred resolution">
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="radio"
                    name="preferred-resolution"
                    checked={returnPreferredResolution === 'refund'}
                    onChange={() => setReturnPreferredResolution('refund')}
                  />
                  Refund
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="radio"
                    name="preferred-resolution"
                    checked={returnPreferredResolution === 'replacement'}
                    onChange={() => setReturnPreferredResolution('replacement')}
                  />
                  Replacement
                </label>
              </div>

              {returnError && <p className="text-sm text-alert">{returnError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleRequestReturn}
                  disabled={isSubmittingReturn || !returnReason.trim()}
                  className="rounded-md bg-alert text-paper px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {isUploadingEvidence ? 'Uploading photo…' : isSubmittingReturn ? 'Submitting…' : 'Submit return request'}
                </button>
                <button
                  onClick={() => setShowReturnForm(false)}
                  className="rounded-md border border-line text-ink px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowReturnForm(true)}
              className="rounded-md border border-alert text-alert px-4 py-2 text-sm font-semibold hover:bg-alert hover:text-paper transition-colors"
            >
              Return product
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-4 border-t border-line">
        <h2 className="font-medium text-accent-dark">Status timeline</h2>
        {!hasPendingPaymentEvent && (
          <div className="text-sm text-accent/80">
            <span>Order placed</span>
            {order.placedAt !== undefined && <span> — <span>{formatPlacedAt(order.placedAt)}</span></span>}
          </div>
        )}
        {events.map((event) => (
          <div key={event.id} className="text-sm text-accent/80">
            <span>{event.status}</span>
            {event.createdAt !== undefined && (
              <span> — <span>{formatPlacedAt(event.createdAt)}</span></span>
            )}
            {event.note && (
              <span> — <span>{event.note}</span></span>
            )}
            {event.courier && (
              <span> — <span>{event.courier}</span></span>
            )}
            {event.awbNumber && (
              <span> (<span>{event.awbNumber}</span>)</span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
