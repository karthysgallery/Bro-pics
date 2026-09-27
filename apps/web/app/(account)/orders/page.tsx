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
import type { Order, OrderItem } from '@bro-pics/shared';

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: Order }> | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  // [FE-01] A failed list query used to leave `orders` at null forever —
  // an infinite skeleton with no error and no way to retry.
  const [loadError, setLoadError] = useState(false);

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
              if (!firstItem?.previewPath) return [id, null] as const;
              return [id, await resolveMediaUrl(firstItem.previewPath, idToken)] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        setThumbnails(new Map(entries.filter((e): e is [string, string] => e[1] !== null)));
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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" message="Your placed orders will show up here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map(({ id, data }) => (
            <Card as="li" key={id}>
              <Link href={`/orders/${id}`} className="flex items-center gap-4 text-accent-dark">
                {thumbnails.get(id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnails.get(id)} alt="" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-md bg-tint flex-shrink-0" aria-hidden="true" />
                )}
                <span className="font-medium flex-1">{data.orderNo}</span>
                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP_STYLES[data.status]}`}>
                  {statusLabel(data.status)}
                </span>
                <span className="whitespace-nowrap">₹{formatPaise(data.total)}</span>
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </main>
  );
}
