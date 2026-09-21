'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import type { Coupon, Order } from '@bro-pics/shared';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { PageSkeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Card } from '../../../../components/ui/Card';
import { formatPaise } from '../../../../lib/format-price';

function describeCoupon(coupon: Coupon): string {
  if (coupon.type === 'free_ship') return 'Free shipping';
  if (coupon.type === 'flat') return `${formatPaise(coupon.value)} off`;
  return `${coupon.value}% off${coupon.maxDiscountCap ? ` (up to ${formatPaise(coupon.maxDiscountCap)})` : ''}`;
}

export default function CouponsPage() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [usedOrders, setUsedOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/coupons/available', { headers: { Authorization: `Bearer ${idToken}` } });
      setCoupons(response.ok ? (await response.json()).coupons ?? [] : []);

      const db = getFirestore(getFirebaseApp());
      const snapshot = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid)));
      setUsedOrders(
        snapshot.docs.map((d) => d.data() as Order).filter((order): order is Order & { couponId: string } => !!order.couponId)
      );
    })();
  }, [user]);

  if (!user) return <SignedOutNotice action="see your coupons" />;
  if (coupons === null) return <PageSkeleton rows={2} />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-6">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Coupons</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Available now</h2>
        {coupons.length === 0 ? (
          <EmptyState title="No coupons available right now" message="Check back later for offers." />
        ) : (
          <ul className="flex flex-col gap-3">
            {coupons.map((coupon) => (
              <Card as="li" key={coupon.code} className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono font-semibold text-ink">{coupon.code}</span>
                  <p className="text-sm text-ink/60">{describeCoupon(coupon)}</p>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Your coupon history</h2>
        {usedOrders.length === 0 ? (
          <p className="text-sm text-ink/60">You haven&apos;t used a coupon on an order yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {usedOrders.map((order) => (
              <li key={order.id} className="text-sm text-ink/70">
                <span className="font-mono font-medium text-ink">{order.couponId}</span> — {formatPaise(order.discount)} off on order{' '}
                <Link href={`/orders/${order.id}`} className="text-accent hover:text-accent-dark underline">
                  {order.orderNo}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
