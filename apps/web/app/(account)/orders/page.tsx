'use client';

import { useEffect, useState } from 'react';
import { SignedOutNotice } from '../../../components/account/SignedOutNotice';
import Link from 'next/link';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../lib/auth-context';
import { getFirebaseApp } from '../../../lib/firebase-client';
import { STATUS_CHIP_STYLES, statusLabel } from '../../../components/orders/OrderStatusTimeline';
import { PageSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { resolveMediaUrl, getIdTokenSafe } from '../../../lib/resolve-media-url';
import { isOrderInProgress, type Order, type OrderItem } from '@bro-pics/shared';
import { SUPPORT_EMAIL } from '../../../lib/support-contact';
import { formatPaise } from '../../../lib/format-price';

// What the customer should understand about where this order is, in plain
// language — never "being prepared" for something that hasn't been paid for.
function orderBlurb(status: Order['status']): string {
  switch (status) {
    case 'pending_payment':
      return "Payment wasn't completed, so this order isn't confirmed yet. Your items are still in your cart.";
    case 'delivered':
      return 'Delivered · We hope your wall loves it.';
    case 'cancelled':
      return 'This order was cancelled.';
    case 'refunded':
      return 'This order was refunded.';
    case 'shipped':
      return 'On its way to you.';
    case 'replacement_issued':
      return 'A replacement has been arranged.';
    default:
      return 'Your photo is being reviewed and prepared for crafting.';
  }
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: Order }> | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  // First line item's title/qty + how many lines in total, read from the
  // order's own item snapshot (never the live product, which may have been
  // renamed or repriced since).
  const [summaries, setSummaries] = useState<Map<string, { title: string; qty: number; lineCount: number }>>(new Map());
  // [FE-01] A failed list query used to leave `orders` at null forever —
  // an infinite skeleton with no error and no way to retry.
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'delivered'>('all');

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getFirebaseApp());
    const q = query(collection(db, 'orders'), where('userId', '==', uid), orderBy('placedAt', 'desc'));
    getDocs(q)
      .then(async (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, data: d.data() as Order }));
        setOrders(loaded);

        // One preview per order (its first line item's previewPath, resolved
        // to a fresh signed URL) — a best-effort thumbnail, so any failure
        // here just leaves that order without one rather than blocking the
        // list itself from rendering. previewPath is a Storage object path,
        // never a signed URL — a URL minted at order-placement time and
        // reused here would be expired for any order older than an hour.
        const idToken = await getIdTokenSafe(user);
        const entries = await Promise.all(
          loaded.map(async ({ id }) => {
            try {
              const itemsSnapshot = await getDocs(collection(db, 'orders', id, 'items'));
              const firstItem = itemsSnapshot.docs[0]?.data() as OrderItem | undefined;
              const summary = firstItem
                ? { title: firstItem.title, qty: firstItem.qty, lineCount: itemsSnapshot.docs.length }
                : null;
              const thumb = firstItem?.previewPath ? await resolveMediaUrl(firstItem.previewPath, idToken) : null;
              return [id, thumb, summary] as const;
            } catch {
              return [id, null, null] as const;
            }
          })
        );
        setThumbnails(new Map(entries.filter((e): e is readonly [string, string, typeof e[2]] => e[1] !== null).map(([id, url]) => [id, url])));
        setSummaries(new Map(entries.filter((e) => e[2] !== null).map((e) => [e[0], e[2]!])));
      })
      .catch(() => setLoadError(true));
  }, [uid]);

  if (!user) return <SignedOutNotice action="see your orders" />;
  if (loadError) {
    return (
      <EmptyState
        title="Could not load your orders"
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
  if (orders === null) return <PageSkeleton rows={3} />;

  const filteredOrders = orders?.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'delivered') return o.data.status === 'delivered';
    // 'In progress' = paid and on its way. Unpaid (abandoned/failed payment),
    // cancelled and refunded orders only appear under 'All orders'.
    return isOrderInProgress(o.data.status);
  }) ?? [];

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">My orders</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Your framed memories.</h1>
        <p className="text-xs text-ink/60">
          {user.displayName ? `${user.displayName} · ` : ''}Everything you&apos;ve made personal.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
            filter === 'all' ? 'bg-ink text-paper' : 'bg-tint/70 text-ink/70 hover:bg-tint'
          }`}
        >
          All orders
        </button>
        <button
          type="button"
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
            filter === 'in_progress' ? 'bg-ink text-paper' : 'bg-tint/70 text-ink/70 hover:bg-tint'
          }`}
        >
          In progress
        </button>
        <button
          type="button"
          onClick={() => setFilter('delivered')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
            filter === 'delivered' ? 'bg-ink text-paper' : 'bg-tint/70 text-ink/70 hover:bg-tint'
          }`}
        >
          Delivered
        </button>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" message="Your placed orders will show up here." />
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink/60">No orders matching this filter.</div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map(({ id, data }) => (
            <div key={id} className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-line flex-wrap">
                <div className="flex items-center gap-3">
                  <Link href={`/orders/${id}`} className="font-semibold text-sm text-ink hover:underline">
                    {data.orderNo}
                  </Link>
                  <span className="text-xs text-ink/50">
                    · {data.placedAt ? new Date((data.placedAt as any).toDate ? (data.placedAt as any).toDate() : data.placedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-2xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${STATUS_CHIP_STYLES[data.status]}`}>
                    {statusLabel(data.status)}
                  </span>
                  <span className="font-display text-base font-bold text-ink">{formatPaise(data.total)}</span>
                </div>
              </div>

              <div className="py-5 flex flex-col sm:flex-row gap-5 items-start">
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-tint overflow-hidden border border-line flex-shrink-0">
                  {thumbnails.get(id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnails.get(id)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-ink/40">Frame</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-base font-bold text-ink mb-1">
                    {summaries.get(id)
                      ? `${summaries.get(id)!.title} × ${summaries.get(id)!.qty}${
                          summaries.get(id)!.lineCount > 1 ? ` + ${summaries.get(id)!.lineCount - 1} more` : ''
                        }`
                      : 'Personalised Photo Frame'}
                  </h2>
                  <p className="text-xs text-ink/60 mb-4">{orderBlurb(data.status)}</p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/orders/${id}`}
                      className="px-5 py-2 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-sm"
                    >
                      {data.status === 'pending_payment' ? 'View order' : 'Track order'}
                    </Link>
                    {/* An invoice only exists once payment has been confirmed. */}
                    {data.paymentStatus === 'paid' && (
                      <Link
                        href={`/orders/${id}/invoice`}
                        className="px-5 py-2 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
                      >
                        View invoice
                      </Link>
                    )}
                    {data.status === 'pending_payment' && (
                      <Link
                        href="/checkout"
                        className="px-5 py-2 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
                      >
                        Complete payment
                      </Link>
                    )}
                    {data.status === 'delivered' && (
                      <Link
                        href={`/orders/${id}`}
                        className="px-5 py-2 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
                      >
                        Request a return
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-2xs text-ink/50">
        Need help with an order? Contact {SUPPORT_EMAIL} with your order number.
      </p>
    </main>
  );
}
