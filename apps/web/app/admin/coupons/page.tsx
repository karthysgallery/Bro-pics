'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { StatusChip } from '../../../components/admin/StatusChip';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Coupon } from '@bro-pics/shared';

interface CouponFormState {
  code: string;
  type: 'percent' | 'flat' | 'free_ship';
  value: number;
  minOrder?: number;
  maxDiscountCap?: number;
  perUserLimit?: number;
  usageLimit?: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

const BLANK_COUPON: CouponFormState = {
  code: '',
  type: 'percent',
  value: 10,
  minOrder: 0,
  maxDiscountCap: undefined,
  perUserLimit: 1,
  usageLimit: undefined,
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  isActive: true,
};

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

export default function AdminCouponsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer / Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormState>(BLANK_COUPON);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch coupons
  const fetchCoupons = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/coupons', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load coupons');
      const data = await res.json();
      setCoupons(data.coupons || []);
    } catch {
      showToast('Error loading discount coupons', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, [user]);

  // Open Create
  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setForm(BLANK_COUPON);
    setDrawerOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setForm({
      code: c.code,
      type: c.type,
      value: c.type === 'flat' ? Math.round(c.value / 100) : c.value,
      minOrder: c.minOrder ? Math.round(c.minOrder / 100) : 0,
      maxDiscountCap: c.maxDiscountCap ? Math.round(c.maxDiscountCap / 100) : undefined,
      perUserLimit: c.perUserLimit || 1,
      usageLimit: c.usageLimit || undefined,
      startsAt: c.startsAt ? new Date(c.startsAt).toISOString().slice(0, 16) : '',
      endsAt: c.endsAt ? new Date(c.endsAt).toISOString().slice(0, 16) : '',
      isActive: c.isActive ?? true,
    });
    setDrawerOpen(true);
  };

  // Save Coupon
  const handleSaveCoupon = async () => {
    if (!user) return;
    if (!form.code.trim()) {
      showToast('Coupon code is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: form.type === 'flat' ? form.value * 100 : form.value,
        minOrder: form.minOrder ? form.minOrder * 100 : 0,
        maxDiscountCap: form.maxDiscountCap ? form.maxDiscountCap * 100 : undefined,
        perUserLimit: Number(form.perUserLimit) || 1,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        appliesTo: 'all' as const,
        isActive: form.isActive,
      };

      if (editingCoupon) {
        const res = await fetch(`/api/admin/coupons/${editingCoupon.code}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to update coupon');
        }
        showToast(`Coupon ${form.code} updated`, 'success');
      } else {
        const res = await fetch('/api/admin/coupons', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to create coupon');
        }
        showToast(`Coupon ${form.code} created`, 'success');
      }

      setDrawerOpen(false);
      fetchCoupons();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving coupon';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCoupons = coupons.filter((c) => {
    if (!searchQuery.trim()) return true;
    return c.code.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Discount Coupons & Promotional Offers
          </h1>
          <p className="text-xs text-ink/60">
            Create percentage or flat discount coupon codes with minimum cart thresholds, per-user redemption limits, and validity periods.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
        >
          + Create Coupon
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coupon by code (e.g. SAVE10)..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-3">
            <p>No coupons found.</p>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold"
            >
              Create First Coupon
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                  <th className="p-3">Coupon Code</th>
                  <th className="p-3">Discount</th>
                  <th className="p-3">Min Order</th>
                  <th className="p-3">Redemptions</th>
                  <th className="p-3">Validity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredCoupons.map((c) => (
                  <tr key={c.code} className="hover:bg-field/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-ink">
                      {c.code}
                    </td>

                    <td className="p-3 font-bold text-emerald-700">
                      {c.type === 'percent' ? `${c.value}% OFF` : `₹${(c.value / 100).toFixed(0)} OFF`}
                    </td>

                    <td className="p-3 text-ink/70">
                      {c.minOrder ? `₹${(c.minOrder / 100).toFixed(0)}` : 'None'}
                    </td>

                    <td className="p-3 text-ink">
                      <span className="font-bold">{c.usedCount || 0}</span>
                      {c.usageLimit ? <span className="text-ink/40"> / {c.usageLimit}</span> : <span className="text-ink/40"> (Unlimited)</span>}
                    </td>

                    <td className="p-3 text-ink/70 font-mono text-2xs">
                      {formatISTDate(c.startsAt)} → {formatISTDate(c.endsAt)}
                    </td>

                    <td className="p-3">
                      <StatusChip status={c.isActive ? 'published' : 'archived'} size="sm" />
                    </td>

                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(c)}
                        className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      <AdminDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Coupon'}
        subtitle="Configure discount rules, threshold restrictions, and expiry"
      >
        <div className="space-y-4 text-xs">
          <FormField label="Coupon Code" required hint="e.g. WELCOME10, FESTIVE2026">
            <input
              type="text"
              value={form.code}
              disabled={Boolean(editingCoupon)}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="FESTIVE20"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono uppercase focus:outline-none focus:border-gold disabled:opacity-50"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Discount Type" required>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as 'percent' | 'flat' | 'free_ship' }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              >
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </FormField>

            <FormField label={form.type === 'percent' ? 'Discount Percentage (%)' : 'Flat Discount (₹)'} required>
              <input
                type="number"
                min={1}
                max={form.type === 'percent' ? 100 : 50000}
                value={form.value}
                onChange={(e) => setForm((prev) => ({ ...prev, value: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-bold focus:outline-none focus:border-gold"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Min Order Subtotal (₹)" hint="0 for no minimum">
              <input
                type="number"
                min={0}
                value={form.minOrder || 0}
                onChange={(e) => setForm((prev) => ({ ...prev, minOrder: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            {form.type === 'percent' && (
              <FormField label="Max Cap Discount (₹)" hint="Optional ceiling">
                <input
                  type="number"
                  min={0}
                  value={form.maxDiscountCap || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxDiscountCap: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Per-User Redemption Limit">
              <input
                type="number"
                min={1}
                value={form.perUserLimit || 1}
                onChange={(e) => setForm((prev) => ({ ...prev, perUserLimit: Number(e.target.value) || 1 }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            <FormField label="Total Campaign Usage Cap" hint="Leave empty for unlimited">
              <input
                type="number"
                min={1}
                value={form.usageLimit || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, usageLimit: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
            <FormField label="Starts At" required>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                className="w-full px-3 py-1.5 text-2xs rounded-xl border border-line bg-paper text-ink"
              />
            </FormField>

            <FormField label="Ends At" required>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                className="w-full px-3 py-1.5 text-2xs rounded-xl border border-line bg-paper text-ink"
              />
            </FormField>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-field cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="mt-0.5 rounded text-gold focus:ring-gold"
            />
            <div>
              <span className="text-xs font-bold text-ink block">Coupon Active</span>
              <span className="text-2xs text-ink/60">
                Can be applied by customers during checkout.
              </span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCoupon}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingCoupon ? 'Save Changes' : 'Create Coupon'}
            </button>
          </div>
        </div>
      </AdminDrawer>
    </div>
  );
}
