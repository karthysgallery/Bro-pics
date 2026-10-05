'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';

interface Shipment {
  id: string;
  orderId: string;
  courierId: string;
  courierName: string;
  awb: string;
  trackingUrl?: string;
  status: string;
  weightGrams?: number;
  customerName?: string;
  destinationCity?: string;
  createdAt: string;
}

export default function ShipmentsCenterPage() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generatingManifest, setGeneratingManifest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchShipments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/shipments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setShipments(json.shipments || []);
      }
    } catch (err) {
      console.error('Failed to load shipments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [user]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === shipments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(shipments.map((s) => s.id));
    }
  };

  const handleGenerateManifest = async () => {
    if (selectedIds.length === 0 || !user) return;
    setGeneratingManifest(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/shipments/manifest', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentIds: selectedIds,
          courierId: shipments[0]?.courierId || 'delhivery',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate dispatch manifest');
      }

      const json = await res.json();
      setMessage({
        type: 'success',
        text: `Dispatch Manifest ${json.manifest.id} generated for ${selectedIds.length} parcels! Ready for courier handover signature.`,
      });
      setSelectedIds([]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Manifest generation failed' });
    } finally {
      setGeneratingManifest(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Shipments & Dispatch Hub</h1>
          <p className="text-sm text-ink/60 mt-1">
            Track outbound parcels, print dispatch manifests for courier pickup handover, and inspect AWB statuses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateManifest}
            disabled={selectedIds.length === 0 || generatingManifest}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-gold text-ink hover:bg-gold-deep transition shadow-xs flex items-center gap-2 disabled:opacity-50"
          >
            {generatingManifest ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-ink border-t-transparent rounded-full" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            )}
            Generate Courier Manifest ({selectedIds.length})
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Shipments Table */}
      <div className="rounded-2xl bg-paper border border-line overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-field text-[11px] font-semibold text-ink/70 uppercase tracking-wider border-b border-line">
              <tr>
                <th className="px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === shipments.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-line text-gold focus:ring-gold bg-field"
                  />
                </th>
                <th className="px-5 py-3">Order #</th>
                <th className="px-5 py-3">AWB Tracking</th>
                <th className="px-5 py-3">Carrier</th>
                <th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Weight</th>
                <th className="px-5 py-3">Dispatched At</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-ink/50">
                    Loading outbound shipments...
                  </td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-ink/50">
                    No shipments found in dispatch queue.
                  </td>
                </tr>
              ) : (
                shipments.map((s) => {
                  const isSelected = selectedIds.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-field/50 transition ${isSelected ? 'bg-gold/10' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(s.id)}
                          className="w-4 h-4 rounded border-line text-gold focus:ring-gold bg-field"
                        />
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-ink">
                        {s.orderId}
                      </td>
                      <td className="px-5 py-3.5 font-mono">
                        {s.trackingUrl ? (
                          <a
                            href={s.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold font-medium hover:underline inline-flex items-center gap-1"
                          >
                            {s.awb} ↗
                          </a>
                        ) : (
                          <span className="text-ink">{s.awb}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-ink">{s.courierName}</td>
                      <td className="px-5 py-3.5 text-ink/80">
                        {s.destinationCity || 'Bengaluru, KA'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-ink/70">
                        {s.weightGrams ? `${(s.weightGrams / 1000).toFixed(2)} kg` : '1.20 kg'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-ink/60">
                        {new Date(s.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300/40">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
