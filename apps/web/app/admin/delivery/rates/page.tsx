'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';

interface ShippingRates {
  freeShippingThreshold: number; // paise
  defaultFlatRate: number;       // paise
  expressSurcharge: number;      // paise
  codConvenienceFee: number;     // paise
  metroDiscountPaise: number;
  remoteSurchargePaise: number;
}

export default function ShippingRatesPage() {
  const { user } = useAuth();
  const [rates, setRates] = useState<ShippingRates>({
    freeShippingThreshold: 99900,
    defaultFlatRate: 9900,
    expressSurcharge: 15000,
    codConvenienceFee: 5000,
    metroDiscountPaise: 0,
    remoteSurchargePaise: 10000,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadRates() {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/delivery/rates', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.rates) setRates(json.rates);
        }
      } catch (err) {
        console.error('Failed to load rates', err);
      } finally {
        setLoading(false);
      }
    }
    loadRates();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/rates', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rates),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to update shipping rates');
      }

      setMessage({ type: 'success', text: 'Shipping rate rules saved and published to checkout!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save rates' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-cream">Shipping & Delivery Rates</h1>
          <p className="text-sm text-sand/70 mt-1">
            Configure free shipping thresholds, standard flat fees, regional surcharges, and express delivery premiums.
          </p>
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Rates Card */}
        <div className="p-6 rounded-2xl bg-paper border border-line space-y-6">
          <h3 className="text-base font-semibold text-cream border-b border-line pb-3">
            Core Delivery Fees
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
                Free Shipping Order Threshold
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sand text-sm font-mono">₹</span>
                <input
                  type="number"
                  value={rates.freeShippingThreshold / 100}
                  onChange={(e) =>
                    setRates({
                      ...rates,
                      freeShippingThreshold: Math.round((parseFloat(e.target.value) || 0) * 100),
                    })
                  }
                  className="w-full bg-void border border-line rounded-xl pl-8 pr-4 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-sand/60 mt-1.5">
                Orders with subtotal at or above this amount automatically receive free standard shipping.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
                Standard Shipping Flat Fee
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sand text-sm font-mono">₹</span>
                <input
                  type="number"
                  value={rates.defaultFlatRate / 100}
                  onChange={(e) =>
                    setRates({
                      ...rates,
                      defaultFlatRate: Math.round((parseFloat(e.target.value) || 0) * 100),
                    })
                  }
                  className="w-full bg-void border border-line rounded-xl pl-8 pr-4 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-sand/60 mt-1.5">
                Charged when order subtotal is below the free shipping threshold.
              </p>
            </div>
          </div>
        </div>

        {/* Premium & Surcharges Card */}
        <div className="p-6 rounded-2xl bg-paper border border-line space-y-6">
          <h3 className="text-base font-semibold text-cream border-b border-line pb-3">
            Add-on Surcharges & Zone Rules
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
                Express Air Delivery Premium
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sand text-sm font-mono">+ ₹</span>
                <input
                  type="number"
                  value={rates.expressSurcharge / 100}
                  onChange={(e) =>
                    setRates({
                      ...rates,
                      expressSurcharge: Math.round((parseFloat(e.target.value) || 0) * 100),
                    })
                  }
                  className="w-full bg-void border border-line rounded-xl pl-10 pr-4 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-sand/60 mt-1.5">
                Extra fee added if customer selects Priority Express Dispatch at checkout.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
                Cash on Delivery (COD) Convenience Fee
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sand text-sm font-mono">+ ₹</span>
                <input
                  type="number"
                  value={rates.codConvenienceFee / 100}
                  onChange={(e) =>
                    setRates({
                      ...rates,
                      codConvenienceFee: Math.round((parseFloat(e.target.value) || 0) * 100),
                    })
                  }
                  className="w-full bg-void border border-line rounded-xl pl-10 pr-4 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-sand/60 mt-1.5">
                Covers courier COD collection charges and verification risks.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
                Remote / North-East / Island Surcharge
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sand text-sm font-mono">+ ₹</span>
                <input
                  type="number"
                  value={rates.remoteSurchargePaise / 100}
                  onChange={(e) =>
                    setRates({
                      ...rates,
                      remoteSurchargePaise: Math.round((parseFloat(e.target.value) || 0) * 100),
                    })
                  }
                  className="w-full bg-void border border-line rounded-xl pl-10 pr-4 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-sand/60 mt-1.5">
                Applied automatically for remote and special pin zones (e.g. J&K, Northeast, Andaman).
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving || loading}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <span className="animate-spin inline-block w-4 h-4 border-2 border-void border-t-transparent rounded-full" />}
            Save Shipping Rules
          </button>
        </div>
      </form>
    </div>
  );
}
