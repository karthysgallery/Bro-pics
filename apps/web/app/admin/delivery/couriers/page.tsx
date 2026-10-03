'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';

interface Courier {
  id: string;
  name: string;
  code: string;
  trackingUrlTemplate: string;
  isActive: boolean;
  defaultForZones: string[];
  contactPhone?: string;
}

export default function CouriersRegistryPage() {
  const { user } = useAuth();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    trackingUrlTemplate: 'https://example.com/track/{awb}',
    isActive: true,
    defaultForZones: ['metro', 'standard'],
    contactPhone: '',
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCouriers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/couriers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setCouriers(json.couriers || []);
      }
    } catch (err) {
      console.error('Failed to fetch couriers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCouriers();
  }, [user]);

  const handleOpenAdd = () => {
    setEditingCourier(null);
    setFormData({
      name: '',
      code: '',
      trackingUrlTemplate: 'https://example.com/track/{awb}',
      isActive: true,
      defaultForZones: ['metro', 'standard'],
      contactPhone: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (c: Courier) => {
    setEditingCourier(c);
    setFormData({
      name: c.name,
      code: c.code,
      trackingUrlTemplate: c.trackingUrlTemplate,
      isActive: c.isActive,
      defaultForZones: c.defaultForZones || [],
      contactPhone: c.contactPhone || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const url = editingCourier
        ? `/api/admin/delivery/couriers/${editingCourier.id}`
        : '/api/admin/delivery/couriers';
      const method = editingCourier ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save courier');
      }

      setMessage({
        type: 'success',
        text: `Courier ${editingCourier ? 'updated' : 'registered'} successfully!`,
      });
      setShowModal(false);
      fetchCouriers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Operation failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this courier?') || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/delivery/couriers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Courier removed.' });
        fetchCouriers();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete' });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-cream">Courier Partners Registry</h1>
          <p className="text-sm text-sand/70 mt-1">
            Manage fulfillment carrier integrations, live package tracking templates, and zonal assignments.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 flex items-center gap-2"
        >
          <span>➕</span> Add Courier Partner
        </button>
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

      {/* Courier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 p-8 text-center text-sand/60">Loading courier partners...</div>
        ) : couriers.length === 0 ? (
          <div className="col-span-2 p-8 text-center text-sand/60">No couriers found.</div>
        ) : (
          couriers.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl bg-paper border border-line space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚚</span>
                    <h3 className="font-bold text-cream text-base">{c.name}</h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.isActive
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : 'bg-zinc-800 text-sand border border-line'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-sand/80">
                  <div>
                    <span className="text-sand/50">Code:</span>{' '}
                    <span className="font-mono text-cream">{c.code}</span>
                  </div>
                  <div>
                    <span className="text-sand/50">Tracking URL:</span>{' '}
                    <span className="font-mono text-gold/90 break-all">{c.trackingUrlTemplate}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-sand/50">Assigned Zones:</span>
                    {(c.defaultForZones || []).map((z) => (
                      <span
                        key={z}
                        className="px-1.5 py-0.5 rounded bg-tint text-cream text-[10px] uppercase font-mono"
                      >
                        {z}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line/60">
                <button
                  onClick={() => handleOpenEdit(c)}
                  className="px-3 py-1 text-xs rounded-lg bg-tint border border-line hover:border-gold text-cream transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="px-3 py-1 text-xs rounded-lg text-rose-400 hover:text-rose-300 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-paper border border-line rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-cream">
                {editingCourier ? 'Edit Courier Partner' : 'Register New Courier Partner'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-sand hover:text-cream text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-1.5">
                  Courier Partner Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Delhivery Surface"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-1.5">
                  System Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DELHIVERY"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-1.5">
                  Tracking URL Template (Include {'{awb}'} token)
                </label>
                <input
                  type="url"
                  required
                  value={formData.trackingUrlTemplate}
                  onChange={(e) => setFormData({ ...formData, trackingUrlTemplate: e.target.value })}
                  className="w-full bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-line text-gold focus:ring-gold bg-void"
                />
                <label htmlFor="isActiveToggle" className="text-xs text-cream select-none cursor-pointer">
                  Active for automatic courier allocation
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-sand hover:text-cream"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-gold text-void hover:brightness-110 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Courier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
