'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { FormField, SaveBar } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import { BusinessProfileForm, EMPTY_BUSINESS_FORM, type BusinessFormState } from '../../../components/admin/settings/BusinessProfileForm';
import { StateShippingForm, DEFAULT_SHIPPING_FORM, unconfiguredFormStates, type ShippingFormState } from '../../../components/admin/settings/StateShippingForm';
import { ReadinessPanel } from '../../../components/admin/settings/ReadinessPanel';
import { PolicyFactsForm, EMPTY_POLICY_FACTS_FORM, type PolicyFactsFormState } from '../../../components/admin/settings/PolicyFactsForm';
import { ReturnsPolicyForm, DEFAULT_RETURNS_FORM, type ReturnsFormState } from '../../../components/admin/settings/ReturnsPolicyForm';
import { INDIAN_STATES_AND_UTS } from '@bro-pics/shared';
import { paiseToRupees, rupeesToPaise } from '../../../lib/admin-money';

// A GSTIN is 15 characters: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type SettingsTab = 'store' | 'shipping' | 'returns' | 'gst' | 'payments' | 'seo' | 'announcement';

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
  googleVerification?: string;
  bingVerification?: string;
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
  // Starting values are what the storefront itself uses when nothing has been
  // saved yet — never invented placeholders. A form that pre-fills made-up data
  // (a sample GSTIN, phone number or UPI id) turns one careless Save into
  // published, customer-visible "settings".
  const [store, setStore] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);

  // The shipping form edits RUPEES as text (blank = "not set", never 0); the API stores integer PAISE.
  // Converted at the load/save boundary below.
  const [shipping, setShipping] = useState<ShippingFormState>(DEFAULT_SHIPPING_FORM);
  const [returnsForm, setReturnsForm] = useState<ReturnsFormState>(DEFAULT_RETURNS_FORM);
  const [policyFactsForm, setPolicyFactsForm] = useState<PolicyFactsFormState>(EMPTY_POLICY_FACTS_FORM);

  // Tabs whose settings could not be read. Saving over a failed read would
  // overwrite real configuration with this page's defaults, so Save is blocked.
  const [loadFailed, setLoadFailed] = useState<Partial<Record<SettingsTab, boolean>>>({});

  // No courier is pre-filled: add only the couriers you actually use.
  const [couriers, setCouriers] = useState<CourierConfig[]>([]);

  const [gst, setGst] = useState<GstSettings>({
    gstEnabled: false,
    taxRate: 0,
    gstin: '',
  });

  const [payments, setPayments] = useState<PaymentsSettings>({
    codEnabled: false,
    acceptedMethods: ['card', 'upi', 'netbanking', 'wallet'],
    upiId: '',
  });

  const [seo, setSeo] = useState<SeoSettings>({
    defaultTitle: 'KarthysGallery - Premium Custom Photo Frames & Gallery Walls',
    defaultDescription:
      'Turn your favorite moments into handcrafted photo frames. Archival paper, anti-glare glass, and sustainably sourced wood frames.',
    ogImagePath: null,
  });

  const [announcement, setAnnouncement] = useState<AnnouncementBarSettings>({
    message: '',
    linkUrl: '',
    linkText: '',
    isActive: false,
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
        returnsRes,
        policyFactsRes,
      ] = await Promise.all([
        fetch('/api/admin/settings/store', { headers }),
        fetch('/api/admin/settings/shipping', { headers }),
        fetch('/api/admin/settings/courier', { headers }),
        fetch('/api/admin/settings/gst', { headers }),
        fetch('/api/admin/settings/payments', { headers }),
        fetch('/api/admin/settings/seo', { headers }),
        fetch('/api/admin/settings/returns', { headers }),
        fetch('/api/admin/settings/policyFacts', { headers }),
      ]);

      const failed: Partial<Record<SettingsTab, boolean>> = {
        store: !storeRes.ok,
        shipping: !shipRes.ok || !courierRes.ok,
        returns: !returnsRes.ok || !policyFactsRes.ok,
        gst: !gstRes.ok,
        payments: !payRes.ok,
        seo: !seoRes.ok,
      };
      setLoadFailed(failed);

      if (storeRes.ok) {
        const d = await storeRes.json();
        if (d.value) {
          const v = d.value as Record<string, unknown>;
          const t = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
          setStore({
            ...EMPTY_BUSINESS_FORM,
            name: t('name') || EMPTY_BUSINESS_FORM.name,
            supportPhone: t('supportPhone'),
            processingDays: typeof v.processingDays === 'number' ? v.processingDays : EMPTY_BUSINESS_FORM.processingDays,
            description: t('description'),
            legalName: t('legalName'),
            address: t('address'),
            addressLine1: t('addressLine1'),
            addressLine2: t('addressLine2'),
            city: t('city'),
            district: t('district'),
            state: t('state'),
            pincode: t('pincode'),
            country: t('country'),
            supportEmail: t('supportEmail'),
            supportWhatsapp: t('supportWhatsapp'),
            ownerName: t('ownerName'),
            grievanceName: t('grievanceName'),
            grievanceDesignation: t('grievanceDesignation'),
            grievanceEmail: t('grievanceEmail'),
            grievancePhone: t('grievancePhone'),
            gstRegistration: (['not_registered', 'registered', 'unconfirmed'] as const).includes(v.gstRegistration as 'registered') ? (v.gstRegistration as BusinessFormState['gstRegistration']) : 'unconfirmed',
            invoiceNote: t('invoiceNote'),
          });
        }
      }
      if (shipRes.ok) {
        const d = await shipRes.json();
        if (d.value) {
          const charges: Record<string, string> = {};
          for (const [state, paise] of Object.entries((d.value.stateCharges ?? {}) as Record<string, number>)) {
            if (typeof paise === 'number') charges[state] = String(paiseToRupees(paise));
          }
          setShipping({
            homeState: typeof d.value.homeState === 'string' ? d.value.homeState : 'Tamil Nadu',
            stateCharges: charges,
            otherStatesDefaultCharge: typeof d.value.otherStatesDefaultCharge === 'number' ? String(paiseToRupees(d.value.otherStatesDefaultCharge)) : '',
            expressEnabled: d.value.expressEnabled === true,
            expressCharge: typeof d.value.expressCharge === 'number' ? String(paiseToRupees(d.value.expressCharge)) : '',
          });
        }
      }
      if (returnsRes.ok) {
        const d = await returnsRes.json();
        if (d.value) {
          const v = d.value as Record<string, unknown>;
          setReturnsForm({
            claimWindowDays: typeof v.claimWindowDays === 'number' ? String(v.claimWindowDays) : '',
            claimWindowApproved: v.claimWindowApproved === true,
            readyMadeChangeOfMindDays: typeof v.readyMadeChangeOfMindDays === 'number' ? String(v.readyMadeChangeOfMindDays) : '',
            readyMadeChangeOfMindApproved: v.readyMadeChangeOfMindApproved === true,
            unboxingVideoRecommended: v.unboxingVideoRecommended !== false,
            claimInstructions: typeof v.claimInstructions === 'string' ? v.claimInstructions : '',
            replacementPreferred: v.replacementPreferred !== false,
          });
        }
      }
      if (policyFactsRes.ok) {
        const d = await policyFactsRes.json();
        if (d.value) {
          const v = d.value as Record<string, unknown>;
          const next = { ...EMPTY_POLICY_FACTS_FORM };
          for (const key of Object.keys(next) as Array<keyof PolicyFactsFormState>) if (typeof v[key] === 'string') next[key] = v[key] as string;
          setPolicyFactsForm(next);
        }
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

      if (loadFailed[activeTab]) {
        throw new Error('These settings could not be loaded, so saving is blocked to avoid overwriting them. Reload the page and try again.');
      }

      if (activeTab === 'store') {
        if (!store.name.trim()) {
          throw new Error('The store name is required.');
        }
        // Only what was entered is sent: a blank field means "not set", never an empty or invented value.
        const clean = (v: string) => (v.trim() ? v.trim() : undefined);
        const res = await fetch('/api/admin/settings/store', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: store.name.trim(),
            supportPhone: store.supportPhone.trim(),
            processingDays: store.processingDays,
            description: clean(store.description),
            legalName: clean(store.legalName),
            address: clean(store.address),
            addressLine1: clean(store.addressLine1),
            addressLine2: clean(store.addressLine2),
            city: clean(store.city),
            district: clean(store.district),
            state: clean(store.state),
            pincode: clean(store.pincode),
            country: clean(store.country),
            supportEmail: clean(store.supportEmail),
            supportWhatsapp: clean(store.supportWhatsapp),
            ownerName: clean(store.ownerName),
            grievanceName: clean(store.grievanceName),
            grievanceDesignation: clean(store.grievanceDesignation),
            grievanceEmail: clean(store.grievanceEmail),
            grievancePhone: clean(store.grievancePhone),
            gstRegistration: store.gstRegistration,
            invoiceNote: clean(store.invoiceNote),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const issue = body?.issues?.[0]?.message ?? body?.details?.issues?.[0]?.message;
          throw new Error(issue ? `Not saved: ${issue}` : 'Failed to save store settings');
        }
      } else if (activeTab === 'shipping') {
        const stateCharges: Record<string, number> = {};
        for (const state of INDIAN_STATES_AND_UTS) {
          const raw = (shipping.stateCharges[state] ?? '').trim();
          if (state === shipping.homeState || raw === '') continue;
          const paise = rupeesToPaise(Number(raw));
          if (paise === null || !Number.isFinite(Number(raw))) throw new Error(`Enter a valid shipping charge in rupees for ${state}, or leave it empty.`);
          stateCharges[state] = paise;
        }
        const fallbackRaw = shipping.otherStatesDefaultCharge.trim();
        const fallback = fallbackRaw === '' ? null : rupeesToPaise(Number(fallbackRaw));
        if (fallbackRaw !== '' && fallback === null) throw new Error('Enter a valid fallback charge in rupees, or leave it empty.');
        const expressPaise = shipping.expressEnabled ? rupeesToPaise(Number(shipping.expressCharge)) : 0;
        if (shipping.expressEnabled && (shipping.expressCharge.trim() === '' || expressPaise === null)) throw new Error('Enter the express delivery charge in rupees.');
        const [sRes, cRes] = await Promise.all([
          fetch('/api/admin/settings/shipping', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              homeState: shipping.homeState,
              stateCharges,
              otherStatesDefaultCharge: fallback,
              expressEnabled: shipping.expressEnabled,
              expressCharge: expressPaise ?? 0,
            }),
          }),
          fetch('/api/admin/settings/courier', {
            method: 'PUT',
            headers,
            body: JSON.stringify({ couriers }),
          }),
        ]);
        if (!sRes.ok || !cRes.ok) throw new Error('Failed to save shipping settings');
      } else if (activeTab === 'returns') {
        const days = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));
        const claimDays = days(returnsForm.claimWindowDays);
        const readyDays = days(returnsForm.readyMadeChangeOfMindDays);
        for (const [label, v] of [['Claim window', claimDays], ['Ready-made return period', readyDays]] as const) {
          if (v !== null && (!Number.isInteger(v) || v < 0)) throw new Error(`${label}: enter a whole number of days, or leave it empty.`);
        }
        if (returnsForm.claimWindowApproved && claimDays === null) throw new Error('Enter the claim window in days before ticking Approved.');
        if (returnsForm.readyMadeChangeOfMindApproved && readyDays === null) throw new Error('Enter the return period in days before ticking Approved.');
        const res = await fetch('/api/admin/settings/returns', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            claimWindowDays: claimDays,
            claimWindowApproved: returnsForm.claimWindowApproved,
            readyMadeChangeOfMindDays: readyDays,
            readyMadeChangeOfMindApproved: returnsForm.readyMadeChangeOfMindApproved,
            unboxingVideoRecommended: returnsForm.unboxingVideoRecommended,
            claimInstructions: returnsForm.claimInstructions.trim() || undefined,
            replacementPreferred: returnsForm.replacementPreferred,
          }),
        });
        if (!res.ok) throw new Error('Failed to save returns settings');
        const facts: Record<string, string> = {};
        for (const [k, v] of Object.entries(policyFactsForm)) if (v.trim()) facts[k] = v.trim();
        const factsRes = await fetch('/api/admin/settings/policyFacts', { method: 'PUT', headers, body: JSON.stringify(facts) });
        if (!factsRes.ok) throw new Error('Returns settings were saved, but the policy wording could not be saved');
      } else if (activeTab === 'gst') {
        const gstin = (gst.gstin ?? '').trim().toUpperCase();
        if (gst.gstEnabled) {
          if (!(gst.taxRate > 0 && gst.taxRate <= 100)) {
            throw new Error('Enter a GST rate above 0%.');
          }
          if (!GSTIN_PATTERN.test(gstin)) {
            throw new Error('Enter your real 15-character GSTIN before turning GST on.');
          }
        }
        const res = await fetch('/api/admin/settings/gst', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ gstEnabled: gst.gstEnabled, taxRate: gst.taxRate, ...(gstin && { gstin }) }),
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
      window.dispatchEvent(new Event('karthys:settings-saved'));
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

      <ReadinessPanel />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {[
          { id: 'store', label: 'Store Profile' },
          { id: 'shipping', label: 'Shipping & Couriers' },
          { id: 'returns', label: 'Returns & Claims' },
          { id: 'gst', label: 'GST & Invoicing' },
          { id: 'payments', label: 'Payment Methods' },
          { id: 'seo', label: 'Global SEO' },
          { id: 'announcement', label: 'Announcement Bar' },
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
          {loadFailed[activeTab] && (
            <div role="alert" className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-xs">
              Couldn&apos;t load these settings from the server, so the values below are not the saved ones. Saving is
              disabled to avoid overwriting your configuration —{' '}
              <button type="button" onClick={fetchSettings} className="underline font-semibold">
                try again
              </button>
              .
            </div>
          )}

          {/* Store Profile Tab */}
          {activeTab === 'store' && (
            <BusinessProfileForm
              value={store}
              onChange={(patch) => {
                setStore((p) => ({ ...p, ...patch }));
                setIsDirty(true);
              }}
            />
          )}

          {/* Shipping & Couriers Tab */}
          {activeTab === 'shipping' && (
            <div className="space-y-6">
              <StateShippingForm
                value={shipping}
                onChange={(next) => {
                  setShipping(next);
                  setIsDirty(true);
                }}
              />

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
                        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Returns & Claims Tab */}
          {activeTab === 'returns' && (
            <div className="space-y-6">
              <ReturnsPolicyForm
                value={returnsForm}
                onChange={(next) => {
                  setReturnsForm(next);
                  setIsDirty(true);
                }}
              />
              <PolicyFactsForm
                value={policyFactsForm}
                onChange={(next) => {
                  setPolicyFactsForm(next);
                  setIsDirty(true);
                }}
              />
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
                    placeholder="karthysgallery@upi"
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

              <FormField label="Google Search Console verification code" hint='In Search Console choose "HTML tag" and paste only the code inside content="…"'>
                <input
                  type="text"
                  value={seo.googleVerification || ''}
                  onChange={(e) => {
                    setSeo((p) => ({ ...p, googleVerification: e.target.value.trim() }));
                    setIsDirty(true);
                  }}
                  placeholder="e.g. 4d2Xyz-Ab12cD..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
                />
              </FormField>

              <FormField label="Bing Webmaster verification code (optional)">
                <input
                  type="text"
                  value={seo.bingVerification || ''}
                  onChange={(e) => {
                    setSeo((p) => ({ ...p, bingVerification: e.target.value.trim() }));
                    setIsDirty(true);
                  }}
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
                  placeholder="Free Standard Delivery on all orders above ₹1,499!"
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
