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
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Account · Overview & profile</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          {firstName ? `Welcome back, ${firstName}` : 'My account'}
        </h1>
        <p className="text-xs text-ink/60">
          A home for your details, addresses and framed memories.
        </p>
      </div>

      {/* Account Tabs */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/account"
          className="px-4 py-2 rounded-full text-xs font-semibold bg-ink text-paper transition-colors"
        >
          Overview & profile
        </Link>
        <Link
          href="/orders"
          className="px-4 py-2 rounded-full text-xs font-semibold bg-tint/70 text-ink/70 hover:bg-tint transition-colors"
        >
          Orders
        </Link>
        <Link
          href="/account/addresses"
          className="px-4 py-2 rounded-full text-xs font-semibold bg-tint/70 text-ink/70 hover:bg-tint transition-colors"
        >
          Addresses
        </Link>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-paper border border-line shadow-sm">
          <p className="font-display text-2xl font-bold text-ink">{orders.length}</p>
          <p className="text-xs text-ink/60 mt-1">Orders</p>
        </div>
        <div className="p-5 rounded-2xl bg-paper border border-line shadow-sm">
          <p className="font-display text-2xl font-bold text-ink">{pendingDeliveries.length}</p>
          <p className="text-xs text-ink/60 mt-1">On the way</p>
        </div>
        <div className="p-5 rounded-2xl bg-paper border border-line shadow-sm">
          <p className="font-display text-2xl font-bold text-ink">{wishlistIds.length}</p>
          <p className="text-xs text-ink/60 mt-1">Wishlist</p>
        </div>
        <div className="p-5 rounded-2xl bg-paper border border-line shadow-sm">
          <p className="font-display text-2xl font-bold text-ink">{addressCount}</p>
          <p className="text-xs text-ink/60 mt-1">Saved addresses</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start mb-12">
        {/* Left: Profile Information */}
        <div className="rounded-3xl bg-paper border border-line p-6 md:p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold text-ink mb-6">Your profile</h2>
          
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-2xs font-semibold text-ink/60 mb-1">First name</label>
                <input
                  type="text"
                  defaultValue={firstName || ''}
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-2xs font-semibold text-ink/60 mb-1">Last name</label>
                <input
                  type="text"
                  defaultValue=""
                  placeholder="Last name"
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-2xs font-semibold text-ink/60 mb-1">Email</label>
              <input
                type="email"
                defaultValue={user.email || ''}
                readOnly
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-ink/60 mb-1">Mobile</label>
              <input
                type="tel"
                defaultValue={user.phoneNumber || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none focus:border-accent"
              />
              <p className="text-2xs text-ink/50 mt-1">Verified with a one-time code</p>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 text-xs text-ink/80 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-line" />
                <span>Send me occasional framing inspiration and offers</span>
              </label>
            </div>

            <div className="pt-4">
              <button
                type="button"
                className="px-6 py-2.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-sm"
              >
                Save profile
              </button>
            </div>
          </div>

          <p className="text-2xs text-ink/40 mt-6 pt-4 border-t border-line">
            Your photos are private. We only use them to create your frames.
          </p>
        </div>

        {/* Right: Latest order & Address widgets */}
        <div className="space-y-6">
          {recentOrders.length > 0 && (
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-3">Your latest order</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-ink">{recentOrders[0].orderNo}</span>
                  <span className={`text-2xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CHIP_STYLES[recentOrders[0].status]}`}>
                    {statusLabel(recentOrders[0].status)}
                  </span>
                </div>
                <p className="text-xs text-ink/60">
                  Total: ₹{formatPaise(recentOrders[0].total)}
                </p>
                <div className="pt-3">
                  <Link
                    href={`/orders/${recentOrders[0].id}`}
                    className="inline-block px-4 py-2 rounded-full border border-line text-xs font-semibold text-ink hover:bg-tint transition-colors"
                  >
                    View order
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-ink mb-2">Default delivery address</h2>
            <p className="text-xs text-ink/70 leading-relaxed mb-4">
              {addressCount > 0 ? `${addressCount} saved address${addressCount === 1 ? '' : 'es'} in your address book.` : 'No addresses saved yet.'}
            </p>
            <Link
              href="/account/addresses"
              className="inline-block px-4 py-2 rounded-full border border-line text-xs font-semibold text-ink hover:bg-tint transition-colors"
            >
              Manage addresses
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 my-8">
        {LINKS.slice(2).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-line bg-paper p-5 hover:border-accent transition-colors"
          >
            <h2 className="text-sm font-semibold text-ink">{link.label}</h2>
            <p className="text-2xs text-ink/60 mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>

      <div className="pt-6 border-t border-line flex items-center justify-between">
        <button
          onClick={() => signOut()}
          className="text-xs text-ink/60 hover:text-alert font-medium underline underline-offset-4"
        >
          Sign out of this account
        </button>
      </div>

      <PrivacyAndSecurity />
    </main>
  );
}
