'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { PaymentBadge } from '../../../../components/admin/OrderBadges';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { useToast } from '../../../../components/ui/Toast';
import { paymentState } from '../../../../lib/admin-orders-view';

/*
 * One customer: who they are, where they get parcels, every order with its payment and production status, and
 * what the shop has on record (refunds, reviews, coupons given to them). Built only from saved records.
 */

interface Profile {
  id?: string;
  displayName?: string | null;
  firstName?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  disabled?: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
  orderCount?: number;
  totalSpent?: number;
  lastOrderAt?: string | null;
}
interface Address {
  id?: string;
  recipientName?: string | null;
  label?: string | null;
  phone?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  isDefault?: boolean;
}
interface CustomerOrder {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: string;
  total: number;
  placedAt: string | null;
  productTitle: string | null;
  productCount: number;
  refundedAmount?: number;
  notes?: string;
}
interface Review {
  id?: string;
  rating?: number;
  title?: string;
  body?: string;
  status?: string;
  createdAt?: string;
}
interface Coupon {
  code?: string;
  type?: 'percent' | 'flat' | 'free_ship';
  value?: number;
  usedCount?: number;
  isActive?: boolean;
}

function day(iso: unknown, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', ...(withTime && { hour: 'numeric', minute: '2-digit' }) });
}

const card = 'rounded-card border border-line bg-paper p-4 sm:p-5';

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/customers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 404 ? 'No customer with this ID.' : res.status === 403 ? 'Your role cannot see customers.' : 'This customer could not be loaded.');
      const body = await res.json();
      setProfile(body.user ?? {});
      setAddresses(body.addresses ?? []);
      setOrders(body.orders ?? []);
      setReviews(body.reviews ?? []);
      setCoupons(body.coupons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This customer could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBlock = async () => {
    if (!user || !profile) return;
    setBlockBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/customers/${id}/disable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !profile.disabled }),
      });
      if (!res.ok) throw new Error();
      showToast(profile.disabled ? 'Customer can sign in again' : 'Customer blocked from signing in', 'success');
      setConfirmBlock(false);
      void load();
    } catch {
      showToast('The account could not be changed.', 'error');
    } finally {
      setBlockBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 md:px-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-tint" />
        <div className="h-48 animate-pulse rounded-card bg-tint" />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="font-semibold text-ink">{error ?? 'This customer could not be loaded.'}</p>
        <Link href="/admin/customers" className="mt-3 inline-block rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:bg-tint">Back to customers</Link>
      </div>
    );
  }

  // Figures from the orders themselves (the saved totals only count paid orders, so they agree).
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const spent = paidOrders.reduce((s, o) => s + o.total - (o.refundedAmount ?? 0), 0);
  const latest = orders[0]?.placedAt ?? null;
  const pstate = (o: CustomerOrder) => paymentState({ ...o, refundedAmount: o.refundedAmount ?? 0 });
  const refunded = orders.filter((o) => o.status === 'refunded' || (o.refundedAmount ?? 0) > 0);
  const failed = orders.filter((o) => pstate(o) === 'failed');
  const name = profile.displayName || [profile.firstName].filter(Boolean).join(' ') || 'Customer';

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <nav className="flex items-center gap-1.5 text-xs text-ink/55" aria-label="Breadcrumb">
        <Link href="/admin/customers" className="hover:text-gold-deep">Customers</Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{name}</span>
      </nav>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-ink/60">
            Customer since {day(profile.createdAt)}
            {profile.role && profile.role !== 'customer' && ` · ${profile.role.replace(/_/g, ' ')}`}
            {profile.disabled && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Blocked from signing in</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.phone && <a href={`tel:${profile.phone}`} className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Call</a>}
          {profile.phone && <a href={`https://wa.me/${profile.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">WhatsApp</a>}
          <button onClick={() => setConfirmBlock(true)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${profile.disabled ? 'border-line text-ink hover:bg-tint' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
            {profile.disabled ? 'Allow sign-in' : 'Block sign-in'}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Overview">
        {[
          ['Orders', String(orders.length), `${paidOrders.length} paid`],
          ['Total spent', formatPaise(spent), 'Paid orders, after refunds'],
          ['Latest order', day(latest), orders[0] ? `#${orders[0].orderNo}` : ''],
          ['Last sign-in', day(profile.lastLoginAt), ''],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-card border border-line bg-paper p-4">
            <p className="text-xs text-ink/60">{label}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink tabular-nums">{value}</p>
            {note && <p className="text-xs text-ink/50">{note}</p>}
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className={card} aria-labelledby="orders-h">
            <h2 id="orders-h" className="text-sm font-semibold text-ink">Orders</h2>
            {orders.length === 0 ? (
              <p className="mt-3 rounded-xl bg-field px-4 py-6 text-center text-sm text-ink/60">No orders yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-gold-deep">#{o.orderNo}</Link>
                      <p className="truncate text-sm text-ink/65">
                        {o.productTitle ?? 'Product'}{o.productCount > 1 ? ` +${o.productCount - 1} more` : ''} · {day(o.placedAt, true)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <span className="mr-1 font-semibold text-ink tabular-nums">{formatPaise(o.total)}</span>
                      <PaymentBadge state={pstate(o)} size="sm" />
                      {o.status !== 'pending_payment' && <StatusChip status={o.status} size="sm" className="whitespace-nowrap" />}
                      <Link href={`/admin/orders/${o.id}`} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-tint">View order</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(refunded.length > 0 || failed.length > 0 || reviews.length > 0 || orders.some((o) => o.notes)) && (
            <section className={card} aria-labelledby="act-h">
              <h2 id="act-h" className="text-sm font-semibold text-ink">On record</h2>
              <ul className="mt-2 space-y-2 text-sm text-ink/80">
                {failed.map((o) => <li key={`f${o.id}`}>Payment failed on <Link className="text-gold-deep hover:underline" href={`/admin/orders/${o.id}`}>#{o.orderNo}</Link> ({formatPaise(o.total)}, {day(o.placedAt)})</li>)}
                {refunded.map((o) => <li key={`r${o.id}`}>Refunded {formatPaise(o.refundedAmount || o.total)}{o.refundedAmount && o.refundedAmount < o.total ? ` of ${formatPaise(o.total)}` : ''} on <Link className="text-gold-deep hover:underline" href={`/admin/orders/${o.id}`}>#{o.orderNo}</Link></li>)}
                {orders.filter((o) => o.notes).map((o) => <li key={`n${o.id}`}>Staff note on <Link className="text-gold-deep hover:underline" href={`/admin/orders/${o.id}`}>#{o.orderNo}</Link>: {o.notes}</li>)}
                {reviews.map((r, i) => (
                  <li key={r.id ?? i}>
                    Review {r.rating ? `${r.rating}★` : ''}{r.title ? ` “${r.title}”` : ''} · {r.status ?? ''} · {day(r.createdAt)}
                    {r.body && <span className="block text-ink/60">{r.body}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className={card} aria-labelledby="contact-h">
            <h2 id="contact-h" className="text-sm font-semibold text-ink">Contact</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-xs text-ink/55">Phone</dt><dd className="font-mono text-ink">{profile.phone ?? '—'}</dd></div>
              <div><dt className="text-xs text-ink/55">Email</dt><dd className="break-all text-ink">{profile.email ?? '—'}</dd></div>
            </dl>
          </section>

          <section className={card} aria-labelledby="addr-h">
            <h2 id="addr-h" className="text-sm font-semibold text-ink">Saved addresses</h2>
            {addresses.length === 0 ? (
              <p className="mt-2 text-sm text-ink/60">None saved. Each order keeps the address it was sent to.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {addresses.map((a, i) => (
                  <li key={a.id ?? i} className="rounded-xl bg-field px-3 py-2.5">
                    <p className="font-medium text-ink">{a.recipientName || name}{a.label ? ` · ${a.label}` : ''}{a.isDefault && <span className="ml-1.5 text-xs font-normal text-ink/55">(default)</span>}</p>
                    <p className="text-ink/75">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
                    <p className="text-ink/75">{a.city}, {a.state} - {a.pincode}</p>
                    {a.phone && <p className="font-mono text-xs text-ink/60">{a.phone}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {coupons.length > 0 && (
            <section className={card} aria-labelledby="coup-h">
              <h2 id="coup-h" className="text-sm font-semibold text-ink">Coupons given to this customer</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink/80">
                {coupons.map((c, i) => (
                  <li key={c.code ?? i}>
                    <span className="font-mono font-semibold text-ink">{c.code}</span>
                    {c.type === 'percent' ? ` · ${c.value}% off` : c.type === 'free_ship' ? ' · free delivery' : c.value ? ` · ${formatPaise(c.value)} off` : ''}
                    {c.isActive === false ? ' · inactive' : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmBlock}
        title={profile.disabled ? `Let ${name} sign in again?` : `Block ${name} from signing in?`}
        message={profile.disabled ? 'They will be able to sign in and order again.' : 'They will be signed out and cannot sign in until you allow it again. Their orders are not changed.'}
        confirmLabel={profile.disabled ? 'Allow sign-in' : 'Block sign-in'}
        tone={profile.disabled ? 'default' : 'danger'}
        isLoading={blockBusy}
        onConfirm={toggleBlock}
        onCancel={() => setConfirmBlock(false)}
      />
    </div>
  );
}
