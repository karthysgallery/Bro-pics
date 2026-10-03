'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';
import { StatusChip } from '../../../../components/admin/StatusChip';
import Link from 'next/link';

interface CustomerDetail {
  user: {
    uid: string;
    phoneNumber?: string;
    email?: string;
    displayName?: string;
    disabled?: boolean;
    createdAt?: string;
    lastLoginAt?: string;
  };
  addresses: Array<{
    id: string;
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    isDefault?: boolean;
  }>;
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    paymentStatus: string;
    total: number;
    placedAt: string;
    items?: any[];
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    title?: string;
    body: string;
    status: string;
    createdAt: string;
  }>;
  coupons: Array<{
    code: string;
    discountType: string;
    discountValue: number;
    usedAt?: string;
  }>;
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCustomer = async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        throw new Error('Customer not found');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load customer profile' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [user, id]);

  const handleToggleDisabled = async () => {
    if (!data || !user) return;
    const nextDisabled = !data.user.disabled;
    const confirmText = nextDisabled
      ? 'Disable this customer? They will be signed out and unable to place new orders.'
      : 'Re-enable this customer account?';

    if (!confirm(confirmText)) return;

    setTogglingStatus(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/customers/${id}/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ disabled: nextDisabled }),
      });

      if (!res.ok) {
        throw new Error('Failed to update customer status');
      }

      setMessage({
        type: 'success',
        text: `Customer successfully ${nextDisabled ? 'disabled' : 'enabled'}!`,
      });
      fetchCustomer();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Status update failed' });
    } finally {
      setTogglingStatus(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-sand/60">
        Loading customer profile...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-rose-400 bg-paper rounded-2xl border border-line">
        Customer profile not found or could not be loaded.
      </div>
    );
  }

  const orders = data.orders || [];
  const totalSpend = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const aov = orders.length > 0 ? Math.round(totalSpend / orders.length) : 0;

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/customers" className="text-sand hover:text-cream text-sm">
              ← Back to Customers
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold tracking-tight text-cream">
              {data.user.displayName || data.user.phoneNumber || 'Customer Profile'}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                data.user.disabled
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
              }`}
            >
              {data.user.disabled ? 'Account Disabled' : 'Active'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleDisabled}
            disabled={togglingStatus}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
              data.user.disabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-cream border-emerald-500'
                : 'bg-charcoal hover:bg-tint text-rose-400 border-line hover:border-rose-400'
            }`}
          >
            {togglingStatus
              ? 'Updating...'
              : data.user.disabled
              ? 'Re-enable Account'
              : 'Disable Account'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-paper border border-line">
          <div className="text-xs font-semibold text-sand uppercase tracking-wider">
            Lifetime Value (LTV)
          </div>
          <div className="text-2xl font-bold font-mono text-gold mt-1">
            {formatPaise(totalSpend)}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-paper border border-line">
          <div className="text-xs font-semibold text-sand uppercase tracking-wider">
            Total Orders Placed
          </div>
          <div className="text-2xl font-bold font-mono text-cream mt-1">{orders.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-paper border border-line">
          <div className="text-xs font-semibold text-sand uppercase tracking-wider">
            Average Order Value (AOV)
          </div>
          <div className="text-2xl font-bold font-mono text-cream mt-1">
            {formatPaise(aov)}
          </div>
        </div>
      </div>

      {/* Main Grid: Details + Addresses (Left 4 cols) & Orders Timeline (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account Info & Saved Addresses */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-5 rounded-2xl bg-paper border border-line space-y-3">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
              Customer Identity
            </h3>
            <div className="text-xs space-y-2 text-sand/80">
              <div>
                <span className="text-sand/50">UID:</span>{' '}
                <span className="font-mono text-cream">{data.user.uid}</span>
              </div>
              <div>
                <span className="text-sand/50">Phone:</span>{' '}
                <span className="font-mono text-cream">{data.user.phoneNumber || '—'}</span>
              </div>
              <div>
                <span className="text-sand/50">Email:</span>{' '}
                <span className="text-cream">{data.user.email || '—'}</span>
              </div>
              <div>
                <span className="text-sand/50">Joined:</span>{' '}
                <span className="text-cream">
                  {data.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-paper border border-line space-y-3">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
              Saved Delivery Addresses ({data.addresses?.length || 0})
            </h3>
            {data.addresses && data.addresses.length > 0 ? (
              <div className="space-y-3">
                {data.addresses.map((addr, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-void/60 border border-line text-xs space-y-1">
                    <div className="font-bold text-cream">{addr.name} ({addr.phone})</div>
                    <div className="text-sand/80">{addr.line1}</div>
                    {addr.line2 && <div className="text-sand/80">{addr.line2}</div>}
                    <div className="text-sand/60">
                      {addr.city}, {addr.state} — {addr.pincode}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-sand/60">No saved addresses on file.</div>
            )}
          </div>
        </div>

        {/* Right Column: Order History */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-5 rounded-2xl bg-paper border border-line">
            <h3 className="text-base font-semibold text-cream border-b border-line pb-3">
              Order History
            </h3>

            {orders.length === 0 ? (
              <div className="py-8 text-center text-xs text-sand/60">
                No orders placed by this customer yet.
              </div>
            ) : (
              <div className="divide-y divide-line/60">
                {orders.map((o) => (
                  <div key={o.id} className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono font-bold text-sm text-cream hover:text-gold transition"
                        >
                          #{o.orderNo || o.id.slice(0, 8)}
                        </Link>
                        <StatusChip status={o.status as any} />
                      </div>
                      <div className="text-xs text-sand/60 mt-1">
                        Placed on {new Date(o.placedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="font-bold text-sm text-cream">{formatPaise(o.total)}</div>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="text-xs text-gold hover:underline font-sans"
                      >
                        View Order Details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
