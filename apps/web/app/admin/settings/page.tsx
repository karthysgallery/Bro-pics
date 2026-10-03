'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { FormField, SaveBar } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';

type SettingsTab = 'store' | 'shipping' | 'gst' | 'payments' | 'seo' | 'announcement';

interface StoreSettings {
  name: string;
  supportPhone: string;
  processingDays: number;
  description?: string;
}

interface ShippingSettings {
  freeShippingThreshold: number;
  flatShippingCharge: number;
  expressShippingCharge: number;
}

interface CourierConfig {
  code: string;
  name: string;
  trackingUrlTemplate?: string;
}

interface GstSettings {
  gstEnabled: boolean;
  taxRate: number;
  gstin?: string;
}

interface PaymentsSettings {
  codEnabled: boolean;
  acceptedMethods: string[];
  upiId?: string;
}

interface SeoSettings {
  defaultTitle: string;
  defaultDescription: string;
  ogImagePath?: string | null;
}

interface AnnouncementBarSettings {
  message: string;
  linkUrl?: string;
  linkText?: string;
  isActive: boolean;
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Settings states
  const [store, setStore] = useState<StoreSettings>({
    name: 'BroPics Frame Studio',
    supportPhone: '+91 98765 43210',
    processingDays: 3,
    description: 'Bespoke custom photo framing crafted with premium archival materials.',
  });

  const [shipping, setShipping] = useState<ShippingSettings>({
    freeShippingThreshold: 1499,
    flatShippingCharge: 99,
    expressShippingCharge: 249,
  });

  const [couriers, setCouriers] = useState<CourierConfig[]>([
    {
      code: 'DELHIVERY',
      name: 'Delhivery Surface',
      trackingUrlTemplate: 'https://www.delhivery.com/track/package/{awb}',
    },
    {
      code: 'BLUEDART',
      name: 'Blue Dart Air Express',
      trackingUrlTemplate: 'https://www.bluedart.com/tracking/{awb}',
    },
    {
      code: 'DTDC',
      name: 'DTDC Courier',
      trackingUrlTemplate: 'https://www.dtdc.in/tracking/{awb}',
    },
  ]);

  const [gst, setGst] = useState<GstSettings>({
    gstEnabled: true,
    taxRate: 18,
    gstin: '29ABCDE1234F1Z5',
  });

  const [payments, setPayments] = useState<PaymentsSettings>({
    codEnabled: false,
    acceptedMethods: ['card', 'upi', 'netbanking', 'wallet'],
    upiId: 'bropics@icici',
  });

  const [seo, setSeo] = useState<SeoSettings>({
    defaultTitle: 'BroPics - Premium Custom Photo Frames & Gallery Walls',
    defaultDescription:
      'Turn your favorite moments into handcrafted photo frames. Archival paper, anti-glare glass, and sustainably sourced wood frames.',
    ogImagePath: '/images/og-default.jpg',
  });

  const [announcement, setAnnouncement] = useState<AnnouncementBarSettings>({
    message: '🎉 Free Standard Delivery on all orders above ₹1,499 across India!',
    linkUrl: '/products',
    linkText: 'Shop Frames',
    isActive: true,
  });

  // Fetch all settings
  const fetchSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [
        storeRes,
        shipRes,
        courierRes,
        gstRes,
        payRes,
        seoRes,
      ] = await Promise.all([
        fetch('/api/admin/settings/store', { headers }),
        fetch('/api/admin/settings/shipping', { headers }),
        fetch('/api/admin/settings/courier', { headers }),
        fetch('/api/admin/settings/gst', { headers }),
        fetch('/api/admin/settings/payments', { headers }),
        fetch('/api/admin/settings/seo', { headers }),
      ]);

      if (storeRes.ok) {
        const d = await storeRes.json();
        if (d.value) setStore(d.value);
      }
      if (shipRes.ok) {
        const d = await shipRes.json();
        if (d.value) setShipping(d.value);
      }
      if (courierRes.ok) {
        const d = await courierRes.json();
        if (d.value?.couriers) setCouriers(d.value.couriers);
      }
      if (gstRes.ok) {
        const d = await gstRes.json();
        if (d.value) setGst(d.value);
      }
      if (payRes.ok) {
        const d = await payRes.json();
        if (d.value) setPayments(d.value);
      }
      if (seoRes.ok) {
        const d = await seoRes.json();
        if (d.value) setSeo(d.value);
      }
      setIsDirty(false);
    } catch {
      showToast('Error loading store settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [user]);

  // Save current active tab settings
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      if (activeTab === 'store') {
        const res = await fetch('/api/admin/settings/store', {
          method: 'PUT',
          headers,
          body: JSON.stringify(store),
        });
        if (!res.ok) throw new Error('Failed to save store settings');
      } else if (activeTab === 'shipping') {
        const [sRes, cRes] = await Promise.all([
          fetch('/api/admin/settings/shipping', {
            method: 'PUT',
            headers,
            body: JSON.stringify(shipping),
          }),
          fetch('/api/admin/settings/courier', {
            method: 'PUT',
            headers,
            body: JSON.stringify({ couriers }),
          }),
        ]);
        if (!sRes.ok || !cRes.ok) throw new Error('Failed to save shipping settings');
      } else if (activeTab === 'gst') {
        const res = await fetch('/api/admin/settings/gst', {
          method: 'PUT',
          headers,
          body: JSON.stringify(gst),
        });
        if (!res.ok) throw new Error('Failed to save GST settings');
      } else if (activeTab === 'payments') {
        const res = await fetch('/api/admin/settings/payments', {
          method: 'PUT',
          headers,
          body: JSON.stringify(payments),
        });
        if (!res.ok) throw new Error('Failed to save payment settings');
      } else if (activeTab === 'seo') {
        const res = await fetch('/api/admin/settings/seo', {
          method: 'PUT',
          headers,
          body: JSON.stringify(seo),
        });
        if (!res.ok) throw new Error('Failed to save SEO settings');
      } else if (activeTab === 'announcement') {
        const res = await fetch('/api/admin/settings/announcement-bar', {
          method: 'PATCH',
          headers,
          body: JSON.stringify(announcement),
        });
        if (!res.ok) throw new Error('Failed to save announcement bar');
      }

      showToast('Settings saved successfully', 'success');
      setIsDirty(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">Store Settings</h1>
          <p className="text-xs text-ink/60">
            Configure store metadata, shipping thresholds, courier integrations, GST/Tax rules, and SEO defaults.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {[
          { id: 'store', label: '🏪 Store Profile' },
          { id: 'shipping', label: '🚚 Shipping & Couriers' },
          { id: 'gst', label: '🧾 GST & Invoicing' },
          { id: 'payments', label: '💳 Payment Methods' },
          { id: 'seo', label: '🔍 Global SEO' },
          { id: 'announcement', label: '📢 Announcement Bar' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === tab.id
                ? 'bg-ink text-paper dark:bg-paper dark:text-ink shadow-xs'
                : 'text-ink/60 hover:text-ink hover:bg-field'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 space-y-4 animate-pulse bg-paper rounded-2xl border border-line">
          <div className="h-8 bg-field rounded-xl w-1/4" />
          <div className="h-12 bg-field rounded-xl" />
          <div className="h-12 bg-field rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Store Profile Tab */}
          {activeTab === 'store' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                Business Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Brand / Store Name" required>
                  <input
                    type="text"
                    value={store.name}
                    onChange={(e) => {
                      setStore((p) => ({ ...p, name: e.target.value }));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                    required
                  />
                </FormField>

                <FormField label="Customer Support Phone" hint="e.g. +91 98765 43210" required>
                  <input
                    type="text"
                    value={store.supportPhone}
                    onChange={(e) => {
                      setStore((p) => ({ ...p, supportPhone: e.target.value }));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                    required
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Standard Processing Time (Days)"
                  hint="Number of business days needed for custom framing before dispatch."
                  required
                >
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={store.processingDays}
                    onChange={(e) => {
                      setStore((p) => ({ ...p, processingDays: Number(e.target.value) }));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                    required
                  />
                </FormField>
              </div>

              <FormField label="Store Description" hint="Displayed on invoices and brand summaries">
                <textarea
                  rows={3}
                  value={store.description || ''}
                  onChange={(e) => {
                    setStore((p) => ({ ...p, description: e.target.value }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                />
              </FormField>
            </div>
          )}

          {/* Shipping & Couriers Tab */}
          {activeTab === 'shipping' && (
            <div className="space-y-6">
              {/* Shipping Rates */}
              <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
                <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                  Shipping Rates & Thresholds
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    label="Free Shipping Minimum (₹)"
                    hint="Orders above this amount qualify for free standard shipping."
                    required
                  >
                    <input
                      type="number"
                      min={0}
                      value={shipping.freeShippingThreshold}
                      onChange={(e) => {
                        setShipping((p) => ({
                          ...p,
                          freeShippingThreshold: Number(e.target.value),
                        }));
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                      required
                    />
                  </FormField>

                  <FormField
                    label="Standard Shipping Charge (₹)"
                    hint="Charge for orders below free shipping threshold."
                    required
                  >
                    <input
                      type="number"
                      min={0}
                      value={shipping.flatShippingCharge}
                      onChange={(e) => {
                        setShipping((p) => ({
                          ...p,
                          flatShippingCharge: Number(e.target.value),
                        }));
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                      required
                    />
                  </FormField>

                  <FormField
                    label="Express Air Shipping Charge (₹)"
                    hint="Optional expedited priority shipping fee."
                    required
                  >
                    <input
                      type="number"
                      min={0}
                      value={shipping.expressShippingCharge}
                      onChange={(e) => {
                        setShipping((p) => ({
                          ...p,
                          expressShippingCharge: Number(e.target.value),
                        }));
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                      required
                    />
                  </FormField>
                </div>
              </div>

              {/* Couriers Configuration */}
              <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
                    Courier Providers & AWB Tracking
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCouriers((p) => [
                        ...p,
                        {
                          code: `COURIER_${p.length + 1}`,
                          name: 'New Courier Service',
                          trackingUrlTemplate: 'https://track.example.com/{awb}',
                        },
                      ]);
                      setIsDirty(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors"
                  >
                    + Add Courier
                  </button>
                </div>

                <div className="space-y-3">
                  {couriers.map((c, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 rounded-xl border border-line bg-field/30 items-end"
                    >
                      <div className="md:col-span-3">
                        <label className="text-2xs font-semibold text-ink/60 uppercase block mb-1">
                          Code
                        </label>
                        <input
                          type="text"
                          value={c.code}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setCouriers((list) =>
                              list.map((item, i) => (i === idx ? { ...item, code: val } : item))
                            );
                            setIsDirty(true);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink font-mono uppercase focus:border-gold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="text-2xs font-semibold text-ink/60 uppercase block mb-1">
                          Provider Name
                        </label>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCouriers((list) =>
                              list.map((item, i) => (i === idx ? { ...item, name: val } : item))
                            );
                            setIsDirty(true);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="text-2xs font-semibold text-ink/60 uppercase block mb-1">
                          Tracking URL ({'{awb}'} placeholder)
                        </label>
                        <input
                          type="text"
                          value={c.trackingUrlTemplate || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCouriers((list) =>
                              list.map((item, i) =>
                                i === idx ? { ...item, trackingUrlTemplate: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          placeholder="https://.../{awb}"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setCouriers((list) => list.filter((_, i) => i !== idx));
                            setIsDirty(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs font-bold transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tax & GST Tab */}
          {activeTab === 'gst' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                GST Compliance & Tax Invoicing
              </h2>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gstEnabled"
                  checked={gst.gstEnabled}
                  onChange={(e) => {
                    setGst((p) => ({ ...p, gstEnabled: e.target.checked }));
                    setIsDirty(true);
                  }}
                  className="rounded text-gold focus:ring-gold"
                />
                <label
                  htmlFor="gstEnabled"
                  className="text-xs font-bold text-ink cursor-pointer"
                >
                  Enable GST Tax Calculation & Invoicing
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Standard Tax Rate (%)" required>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={gst.taxRate}
                    onChange={(e) => {
                      setGst((p) => ({ ...p, taxRate: Number(e.target.value) }));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                    required
                  />
                </FormField>

                <FormField
                  label="GSTIN Identification Number"
                  hint="Printed on all tax invoices and customer receipts."
                >
                  <input
                    type="text"
                    value={gst.gstin || ''}
                    onChange={(e) => {
                      setGst((p) => ({ ...p, gstin: e.target.value.toUpperCase() }));
                      setIsDirty(true);
                    }}
                    placeholder="29ABCDE1234F1Z5"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono uppercase focus:border-gold focus:outline-none"
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Payment Methods Tab */}
          {activeTab === 'payments' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                Payment Gateways & Options
              </h2>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="codEnabled"
                  checked={payments.codEnabled}
                  onChange={(e) => {
                    setPayments((p) => ({ ...p, codEnabled: e.target.checked }));
                    setIsDirty(true);
                  }}
                  className="rounded text-gold focus:ring-gold"
                />
                <label
                  htmlFor="codEnabled"
                  className="text-xs font-bold text-ink cursor-pointer"
                >
                  Enable Cash on Delivery (COD) Checkout
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Business UPI ID (Display / Offline Payments)"
                  hint="UPI handle for manual transfers or invoices."
                >
                  <input
                    type="text"
                    value={payments.upiId || ''}
                    onChange={(e) => {
                      setPayments((p) => ({ ...p, upiId: e.target.value.toLowerCase() }));
                      setIsDirty(true);
                    }}
                    placeholder="bropics@icici"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Global SEO Tab */}
          {activeTab === 'seo' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                Global Storefront SEO & Open Graph
              </h2>

              <FormField label="Default Site Title" hint="Used when page-specific title is not set" required>
                <input
                  type="text"
                  value={seo.defaultTitle}
                  onChange={(e) => {
                    setSeo((p) => ({ ...p, defaultTitle: e.target.value }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                  required
                />
              </FormField>

              <FormField
                label="Default Meta Description"
                hint="Summarizes your shop in Google search results"
                required
              >
                <textarea
                  rows={3}
                  value={seo.defaultDescription}
                  onChange={(e) => {
                    setSeo((p) => ({ ...p, defaultDescription: e.target.value }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                  required
                />
              </FormField>

              <FormField label="OpenGraph Default Share Image URL">
                <input
                  type="text"
                  value={seo.ogImagePath || ''}
                  onChange={(e) => {
                    setSeo((p) => ({ ...p, ogImagePath: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="/images/og-default.jpg"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                />
              </FormField>
            </div>
          )}

          {/* Announcement Bar Tab */}
          {activeTab === 'announcement' && (
            <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">
                Top Announcement Bar
              </h2>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="announcementActive"
                  checked={announcement.isActive}
                  onChange={(e) => {
                    setAnnouncement((p) => ({ ...p, isActive: e.target.checked }));
                    setIsDirty(true);
                  }}
                  className="rounded text-gold focus:ring-gold"
                />
                <label
                  htmlFor="announcementActive"
                  className="text-xs font-bold text-ink cursor-pointer"
                >
                  Display Announcement Bar across Storefront
                </label>
              </div>

              <FormField label="Announcement Message" required>
                <input
                  type="text"
                  value={announcement.message}
                  onChange={(e) => {
                    setAnnouncement((p) => ({ ...p, message: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="🎉 Free Standard Delivery on all orders above ₹1,499!"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                  required
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Action Link Text (Optional)">
                  <input
                    type="text"
                    value={announcement.linkText || ''}
                    onChange={(e) => {
                      setAnnouncement((p) => ({ ...p, linkText: e.target.value }));
                      setIsDirty(true);
                    }}
                    placeholder="e.g. Shop Now"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                  />
                </FormField>

                <FormField label="Action Link URL (Optional)">
                  <input
                    type="text"
                    value={announcement.linkUrl || ''}
                    onChange={(e) => {
                      setAnnouncement((p) => ({ ...p, linkUrl: e.target.value }));
                      setIsDirty(true);
                    }}
                    placeholder="e.g. /products"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                  />
                </FormField>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Save Bar */}
      <SaveBar
        isDirty={isDirty}
        isSaving={saving}
        onSave={handleSave}
        onReset={() => {
          fetchSettings();
          setIsDirty(false);
        }}
      />
    </div>
  );
}
