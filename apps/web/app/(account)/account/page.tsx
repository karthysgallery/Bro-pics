'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, doc, getDoc, query, where, orderBy, getDocs } from 'firebase/firestore';
import type { Order, Product, User as BroPicsUser } from '@bro-pics/shared';
import { SignedOutNotice } from '../../../components/account/SignedOutNotice';
import { useAuth } from '../../../lib/auth-context';
import { getFirebaseApp } from '../../../lib/firebase-client';
import { PrivacyAndSecurity } from '../../../components/account/PrivacyAndSecurity';
import { RecentlyViewedRail } from '../../../components/product/RecentlyViewedRail';
import { ProductRail } from '../../../components/home/ProductRail';
import { PageSkeleton } from '../../../components/ui/Skeleton';
import { getWishlistIds, subscribeToWishlist } from '../../../lib/wishlist';
import { getWishlistBasedRecommendations, getTrendingProducts } from '../../../lib/recommendations';
import { STATUS_CHIP_STYLES, statusLabel } from '../../../components/orders/OrderStatusTimeline';
import { formatPaise } from '../../../lib/format-price';

const LINKS = [
  { href: '/orders', label: 'My orders', desc: 'Track and review your past orders' },
  { href: '/account/addresses', label: 'Addresses', desc: 'Manage your saved delivery addresses' },
  { href: '/account/wishlist', label: 'Wishlist', desc: 'Products you have saved for later' },
  { href: '/account/profile', label: 'Profile', desc: 'Update your name and email' },
  { href: '/account/reviews', label: 'My reviews', desc: 'Reviews you have submitted' },
  { href: '/account/notifications', label: 'Notifications', desc: 'Order updates and offers, plus your preferences' },
  { href: '/account/coupons', label: 'Coupons', desc: 'Available offers and your coupon history' },
  { href: '/account/payment-methods', label: 'Payment methods', desc: 'Supported ways to pay at checkout' },
];

// Orders that have been paid for but haven't reached the customer yet —
// used for the "pending deliveries" count, matching CANCELLABLE-adjacent
// status sets used elsewhere (e.g. orders/[orderId]/page.tsx's own
// CANCELLABLE_STATUSES) as the reference for "which statuses mean what."
const PENDING_DELIVERY_STATUSES = new Set(['paid', 'in_production', 'printed_packed', 'shipped']);

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [addressCount, setAddressCount] = useState<number | null>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [firstName, setFirstName] = useState<string | null>(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getFirebaseApp());

    getDocs(query(collection(db, 'orders'), where('userId', '==', uid), orderBy('placedAt', 'desc'))).then((snapshot) => {
      setOrders(snapshot.docs.map((d) => d.data() as Order));
    });
    getDocs(collection(db, 'users', uid, 'addresses')).then((snapshot) => {
      setAddressCount(snapshot.docs.length);
    });
    // Firebase Auth's own user.displayName is a separate field this app
    // never sets (the profile page only writes to the Firestore doc) — the
    // welcome message's name has to come from there instead.
    getDoc(doc(db, 'users', uid)).then((snapshot) => {
      const data = snapshot.data() as BroPicsUser | undefined;
      setFirstName(data?.firstName ?? data?.displayName?.split(' ')[0] ?? null);
    });
  }, [uid]);

  useEffect(() => {
    const load = () => setWishlistIds(getWishlistIds());
    load();
    return subscribeToWishlist(load);
  }, []);

  useEffect(() => {
    const fetchRecommended = wishlistIds.length > 0 ? getWishlistBasedRecommendations(wishlistIds, 8) : getTrendingProducts(null, 8);
    fetchRecommended.then(setRecommended).catch(() => setRecommended([]));
  }, [wishlistIds]);

  if (!user) return <SignedOutNotice action="see your account" />;
  if (orders === null || addressCount === null) return <PageSkeleton />;

  const pendingDeliveries = orders.filter((order) => PENDING_DELIVERY_STATUSES.has(order.status));
  const recentOrders = orders.slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{firstName ? `Welcome back, ${firstName}` : 'My account'}</h1>
        <p className="text-sm text-ink/60 mt-1">{user.phoneNumber}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link href="/orders" className="rounded-2xl border border-line bg-paper p-4 hover:border-accent transition-colors">
          <span className="text-2xl font-semibold text-ink">{orders.length}</span>
          <p className="text-sm text-ink/60">Orders</p>
        </Link>
        <Link href="/account/wishlist" className="rounded-2xl border border-line bg-paper p-4 hover:border-accent transition-colors">
          <span className="text-2xl font-semibold text-ink">{wishlistIds.length}</span>
          <p className="text-sm text-ink/60">Wishlist</p>
        </Link>
        <Link href="/account/addresses" className="rounded-2xl border border-line bg-paper p-4 hover:border-accent transition-colors">
          <span className="text-2xl font-semibold text-ink">{addressCount}</span>
          <p className="text-sm text-ink/60">Addresses</p>
        </Link>
        <div className="rounded-2xl border border-line bg-paper p-4">
          <span className="text-2xl font-semibold text-ink">{pendingDeliveries.length}</span>
          <p className="text-sm text-ink/60">On the way</p>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Recent orders</h2>
            <Link href="/orders" className="text-sm text-accent hover:text-accent-dark">View all</Link>
          </div>
          <ul className="flex flex-col gap-2">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4 hover:border-accent transition-colors"
                >
                  <span className="font-medium text-ink">{order.orderNo}</span>
                  <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP_STYLES[order.status]}`}>
                    {statusLabel(order.status)}
                  </span>
                  <span className="text-ink/70 whitespace-nowrap">{formatPaise(order.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-line bg-paper p-5 hover:border-accent transition-colors"
          >
            <h2 className="text-sm font-semibold text-ink">{link.label}</h2>
            <p className="text-sm text-ink/60 mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>

      <RecentlyViewedRail />
      <ProductRail title="Recommended for you" products={recommended} />

      <button
        onClick={() => signOut()}
        className="rounded-full border border-line text-ink px-6 py-3 text-sm font-semibold hover:border-accent hover:text-accent transition-colors w-fit"
      >
        Sign out
      </button>

      <PrivacyAndSecurity />
    </main>
  );
}
