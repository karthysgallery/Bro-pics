'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { AdminModal, ConfirmModal } from '../../../../components/admin/AdminModal';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';

interface UserAddress {
  id?: string;
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  isDefault?: boolean;
}

interface OrderItem {
  productId?: string;
  title?: string;
  quantity?: number;
  price?: number;
}

interface CustomerOrder {
  id: string;
  status: string;
  total: number;
  placedAt: unknown;
  items?: OrderItem[];
}

interface CustomerReview {
  id: string;
  productId: string;
  productTitle?: string;
  rating: number;
  comment?: string;
  title?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: unknown;
}

interface CustomerCoupon {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderValue?: number;
  startsAt: unknown;
  endsAt: unknown;
  usedCount?: number;
  isActive?: boolean;
}

interface CustomerData {
  user: {
    uid?: string;
    id?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    role?: string;
    disabled?: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  addresses: UserAddress[];
  orders: CustomerOrder[];
  reviews: CustomerReview[];
  coupons: CustomerCoupon[];
}

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  const d = new Date(dateVal as string | number | Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: customerId } = use(params);
  const { user: authUser } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isTogglingDisable, setIsTogglingDisable] = useState(false);
  const [isAssignCouponOpen, setIsAssignCouponOpen] = useState(false);
  const [isSubmittingCoupon, setIsSubmittingCoupon] = useState(false);

  // Coupon form state
  const [couponForm, setCouponForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 10,
    minOrderValue: 0,
    endsAtDays: 30,
    perUserLimit: 1,
  });

  const fetchCustomer = async () => {
    if (!authUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await authUser.getIdToken();
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Customer not found');
        throw new Error('Failed to load customer profile');
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching customer data');
      showToast(err instanceof Error ? err.message : 'Error fetching customer', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [customerId, authUser]);

  const handleToggleDisable = async () => {
    if (!authUser || !data?.user) return;
    setIsTogglingDisable(true);
    const newDisabledState = !data.user.disabled;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch(`/api/admin/customers/${customerId}/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ disabled: newDisabledState }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to update customer status');
      }
      showToast(
        newDisabledState ? 'Customer account disabled' : 'Customer account re-enabled',
        'success'
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              user: { ...prev.user, disabled: newDisabledState },
            }
          : null
      );
      setIsDisableModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating account status', 'error');
    } finally {
      setIsTogglingDisable(false);
    }
  };

  const handleAssignCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !couponForm.code.trim()) return;
    setIsSubmittingCoupon(true);
    try {
      const token = await authUser.getIdToken();
      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + couponForm.endsAtDays);

      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        type: couponForm.type,
        value: Number(couponForm.value),
        minOrderValue: Number(couponForm.minOrderValue) || 0,
        startsAt: now.toISOString(),
        endsAt: expiryDate.toISOString(),
        perUserLimit: Number(couponForm.perUserLimit) || 1,
        assignedUserId: customerId,
        isActive: true,
      };

      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to assign coupon');
      }

      showToast(`Coupon ${payload.code} assigned to customer`, 'success');
      setIsAssignCouponOpen(false);
      setCouponForm({
        code: '',
        type: 'percentage',
        value: 10,
        minOrderValue: 0,
        endsAtDays: 30,
        perUserLimit: 1,
      });
      fetchCustomer();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to assign coupon', 'error');
    } finally {
      setIsSubmittingCoupon(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-field rounded-xl w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-24 bg-field rounded-2xl" />
          <div className="h-24 bg-field rounded-2xl" />
          <div className="h-24 bg-field rounded-2xl" />
          <div className="h-24 bg-field rounded-2xl" />
        </div>
        <div className="h-64 bg-field rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <Link
          href="/admin/customers"
          className="text-xs text-ink/60 hover:text-gold flex items-center gap-1 font-semibold"
        >
          ← Back to Customers
        </Link>
        <div className="p-12 rounded-2xl border border-line bg-paper text-center space-y-3">
          <span className="text-3xl">⚠️</span>
          <h2 className="text-base font-bold text-ink">Failed to load customer profile</h2>
          <p className="text-xs text-ink/60">{error || 'Customer profile not found.'}</p>
          <button
            onClick={fetchCustomer}
            className="px-4 py-2 bg-gold text-ink font-bold text-xs rounded-xl shadow-xs"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user, addresses, orders, reviews, coupons } = data;
  const totalSpend = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const isDisabled = !!user.disabled;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <Link
            href="/admin/customers"
            className="text-xs text-ink/60 hover:text-gold flex items-center gap-1 font-semibold mb-2"
          >
            ← Back to Customer Directory
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
              {user.displayName || 'Customer Profile'}
            </h1>
            {isDisabled ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-red-500/10 text-red-500 border border-red-500/30">
                Disabled Account
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                Active Customer
              </span>
            )}
          </div>
          <p className="text-xs text-ink/50 font-mono mt-0.5">UID: {customerId}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCouponForm((prev) => ({
                ...prev,
                code: `VIP-${customerId.slice(0, 5).toUpperCase()}`,
              }));
              setIsAssignCouponOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-field hover:bg-field-hover border border-line text-xs font-bold text-ink transition-colors flex items-center gap-1.5"
          >
            <span>🎟️</span> Assign Coupon
          </button>
          <button
            onClick={() => setIsDisableModalOpen(true)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              isDisabled
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30'
            }`}
          >
            {isDisabled ? 'Re-enable Account' : 'Disable Account'}
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
          <span className="text-2xs font-semibold text-ink/50 uppercase tracking-wider">
            Lifetime Spend
          </span>
          <div className="text-xl font-bold font-display text-gold-deep">
            {formatCurrency(totalSpend)}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
          <span className="text-2xs font-semibold text-ink/50 uppercase tracking-wider">
            Total Orders
          </span>
          <div className="text-xl font-bold font-display text-ink">{orders.length}</div>
        </div>

        <div className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
          <span className="text-2xs font-semibold text-ink/50 uppercase tracking-wider">
            Reviews Given
          </span>
          <div className="text-xl font-bold font-display text-ink">{reviews.length}</div>
        </div>

        <div className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-1">
          <span className="text-2xs font-semibold text-ink/50 uppercase tracking-wider">
            Assigned Coupons
          </span>
          <div className="text-xl font-bold font-display text-ink">{coupons.length}</div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Customer Profile & Addresses */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center gap-2">
              <span>👤</span> Contact Details
            </h2>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-ink/50 block text-2xs uppercase">Full Name</span>
                <span className="font-semibold text-ink">
                  {user.displayName || 'Anonymous User'}
                </span>
              </div>
              <div>
                <span className="text-ink/50 block text-2xs uppercase">Email Address</span>
                <span className="font-mono text-ink">{user.email || '—'}</span>
              </div>
              <div>
                <span className="text-ink/50 block text-2xs uppercase">Phone Number</span>
                <span className="font-mono text-ink">{user.phone || '—'}</span>
              </div>
              <div>
                <span className="text-ink/50 block text-2xs uppercase">Joined On</span>
                <span className="font-mono text-ink">{formatISTDate(user.createdAt)}</span>
              </div>
              <div>
                <span className="text-ink/50 block text-2xs uppercase">Account Role</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line inline-block mt-0.5">
                  {user.role || 'customer'}
                </span>
              </div>
            </div>
          </div>

          {/* Saved Addresses */}
          <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>📍</span> Saved Addresses ({addresses.length})
              </span>
            </h2>

            {addresses.length === 0 ? (
              <p className="text-xs text-ink/40 italic py-2">No saved addresses found.</p>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr, idx) => (
                  <div
                    key={addr.id || idx}
                    className="p-3.5 rounded-xl border border-line bg-field/40 text-xs space-y-1 relative"
                  >
                    {addr.isDefault && (
                      <span className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-gold/10 text-gold-deep border border-gold/30">
                        Default
                      </span>
                    )}
                    <div className="font-bold text-ink">{addr.name || 'Recipient'}</div>
                    {addr.phone && <div className="text-ink/60 font-mono text-2xs">{addr.phone}</div>}
                    <div className="text-ink/80 pt-1">
                      {addr.line1}
                      {addr.line2 ? `, ${addr.line2}` : ''}
                    </div>
                    <div className="text-ink/80">
                      {addr.city}, {addr.state} - {addr.pincode}
                    </div>
                    <div className="text-ink/50 text-2xs uppercase">{addr.country || 'India'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order History, Reviews, Coupons */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order History */}
          <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>📦</span> Recent Orders ({orders.length})
              </span>
            </h2>

            {orders.length === 0 ? (
              <p className="text-xs text-ink/40 italic py-4 text-center">No orders placed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                      <th className="p-2.5">Order ID</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Items</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Total</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-field/30 transition-colors">
                        <td className="p-2.5 font-mono font-bold text-ink">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="hover:text-gold hover:underline"
                          >
                            #{o.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="p-2.5 font-mono text-ink/60 text-2xs">
                          {formatISTDate(o.placedAt)}
                        </td>
                        <td className="p-2.5 text-ink/80">{o.items?.length || 1} item(s)</td>
                        <td className="p-2.5">
                          <StatusChip status={o.status} />
                        </td>
                        <td className="p-2.5 text-right font-bold text-ink">
                          {formatCurrency(o.total)}
                        </td>
                        <td className="p-2.5 text-right">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="px-2 py-1 rounded bg-field hover:bg-gold/10 hover:text-gold-deep text-2xs font-bold transition-colors inline-block"
                          >
                            View ↗
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Reviews */}
          <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>⭐</span> Reviews & Ratings ({reviews.length})
              </span>
            </h2>

            {reviews.length === 0 ? (
              <p className="text-xs text-ink/40 italic py-4 text-center">
                No reviews written by this customer.
              </p>
            ) : (
              <div className="space-y-3">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3.5 rounded-xl border border-line bg-field/30 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-amber-500 font-bold">
                          {'★'.repeat(rev.rating)}
                          {'☆'.repeat(5 - rev.rating)}
                        </div>
                        <span className="text-ink/50 text-2xs font-mono">
                          {formatISTDate(rev.createdAt)}
                        </span>
                      </div>
                      <StatusChip status={rev.status} />
                    </div>
                    {rev.title && <div className="font-bold text-ink">{rev.title}</div>}
                    {rev.comment && <p className="text-ink/80 text-xs">{rev.comment}</p>}
                    <div className="text-2xs text-ink/40 font-mono">Product ID: {rev.productId}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Coupons */}
          <div className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>🎟️</span> Assigned Coupons ({coupons.length})
              </span>
            </h2>

            {coupons.length === 0 ? (
              <p className="text-xs text-ink/40 italic py-4 text-center">
                No personalized coupons assigned.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {coupons.map((cpn) => (
                  <div
                    key={cpn.code}
                    className="p-3.5 rounded-xl border border-gold/30 bg-gold/5 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-gold-deep text-sm">{cpn.code}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-field border border-line">
                        {cpn.type === 'percentage' ? `${cpn.value}% OFF` : `₹${cpn.value} OFF`}
                      </span>
                    </div>
                    <div className="text-ink/60 text-2xs">
                      Min spend: {formatCurrency(cpn.minOrderValue || 0)}
                    </div>
                    <div className="text-ink/60 text-2xs">
                      Valid until: {formatISTDate(cpn.endsAt)}
                    </div>
                    <div className="text-ink/40 text-2xs font-mono">
                      Used: {cpn.usedCount || 0} times
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disable / Enable Confirmation Modal */}
      <ConfirmModal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        onConfirm={handleToggleDisable}
        title={isDisabled ? 'Re-enable Customer Account' : 'Disable Customer Account'}
        message={
          isDisabled
            ? `Are you sure you want to re-enable ${user.displayName || 'this customer'}? They will be allowed to log in and place new orders.`
            : `Are you sure you want to disable ${user.displayName || 'this customer'}? All active login sessions will be immediately terminated and checkout will be blocked.`
        }
        confirmText={
          isTogglingDisable ? 'Processing...' : isDisabled ? 'Re-enable Account' : 'Disable Account'
        }
        variant={isDisabled ? 'primary' : 'danger'}
      />

      {/* Assign Coupon Modal */}
      <AdminModal
        isOpen={isAssignCouponOpen}
        onClose={() => setIsAssignCouponOpen(false)}
        title="Assign Exclusive Coupon"
        description={`Create a dedicated coupon code tied specifically to ${user.displayName || 'this customer'}.`}
      >
        <form onSubmit={handleAssignCoupon} className="space-y-4">
          <FormField
            label="Coupon Code"
            hint="Unique code that the customer will enter during checkout."
            required
          >
            <input
              type="text"
              value={couponForm.code}
              onChange={(e) =>
                setCouponForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
              }
              placeholder="e.g. VIP-SPECIAL20"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink uppercase font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Discount Type" required>
              <select
                value={couponForm.type}
                onChange={(e) =>
                  setCouponForm((prev) => ({
                    ...prev,
                    type: e.target.value as 'percentage' | 'fixed',
                  }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Flat Amount (₹)</option>
              </select>
            </FormField>

            <FormField
              label={couponForm.type === 'percentage' ? 'Discount (%)' : 'Amount (₹)'}
              required
            >
              <input
                type="number"
                min={1}
                max={couponForm.type === 'percentage' ? 100 : 100000}
                value={couponForm.value}
                onChange={(e) =>
                  setCouponForm((prev) => ({ ...prev, value: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                required
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min Order Value (₹)">
              <input
                type="number"
                min={0}
                value={couponForm.minOrderValue}
                onChange={(e) =>
                  setCouponForm((prev) => ({ ...prev, minOrderValue: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>

            <FormField label="Validity (Days)">
              <input
                type="number"
                min={1}
                max={365}
                value={couponForm.endsAtDays}
                onChange={(e) =>
                  setCouponForm((prev) => ({ ...prev, endsAtDays: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setIsAssignCouponOpen(false)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCoupon}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmittingCoupon ? 'Assigning...' : 'Create & Assign Coupon'}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
