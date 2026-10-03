'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';

interface ServiceabilityItem {
  id: string;
  pincode: string;
  state: string;
  zone: 'metro' | 'standard' | 'remote';
  isServiceable: boolean;
  etaMinDays: number;
  etaMaxDays: number;
  codAvailable: boolean;
  preferredCourierId?: string;
}

export default function DeliveryServiceabilityPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceabilityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchServiceability = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (zoneFilter) params.set('zone', zoneFilter);

      const res = await fetch(`/api/admin/delivery/serviceability?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.serviceability || []);
      }
    } catch (err) {
      console.error('Failed to fetch serviceability', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceability();
  }, [user, zoneFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchServiceability();
  };

  const handleCsvImport = async () => {
    if (!csvText.trim() || !user) return;
    setImporting(true);
    setMessage(null);
    try {
      // Parse CSV (pincode,state,zone,etaMinDays,etaMaxDays,codAvailable)
      const lines = csvText.trim().split('\n');
      const parsedItems: any[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || (i === 0 && line.toLowerCase().includes('pincode'))) continue;
        const [pincode, state, zone, etaMin, etaMax, cod] = line.split(',').map((s) => s.trim());
        if (pincode && state) {
          parsedItems.push({
            pincode,
            state,
            zone: ['metro', 'standard', 'remote'].includes(zone) ? zone : 'standard',
            isServiceable: true,
            etaMinDays: parseInt(etaMin, 10) || 3,
            etaMaxDays: parseInt(etaMax, 10) || 5,
            codAvailable: cod?.toLowerCase() === 'true' || cod === '1',
          });
        }
      }

      if (parsedItems.length === 0) {
        throw new Error('No valid pincode rows found in CSV data.');
      }

      const token = await user.getIdToken();
      const res = await fetch('/api/admin/delivery/serviceability/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: parsedItems }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Import failed');
      }

      setMessage({
        type: 'success',
        text: `Successfully imported ${parsedItems.length} pincodes!`,
      });
      setShowImportModal(false);
      setCsvText('');
      fetchServiceability();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-cream">Pincode Serviceability</h1>
          <p className="text-sm text-sand/70 mt-1">
            Configure delivery coverage, ETA promises, and COD availability across 19,000+ Indian postal codes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 flex items-center gap-2"
          >
            <span>📥</span> Bulk CSV Import
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

      {/* Filters & Search */}
      <div className="p-4 rounded-2xl bg-paper border border-line flex flex-col sm:flex-row items-center gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full">
          <input
            type="text"
            placeholder="Search by 6-digit Pincode or State (e.g. 560001, Karnataka)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
          >
            <option value="">All Zones</option>
            <option value="metro">Metro (Tier 1)</option>
            <option value="standard">Standard (Tier 2/3)</option>
            <option value="remote">Remote / Special</option>
          </select>
        </div>
      </div>

      {/* Serviceability Table */}
      <div className="rounded-2xl bg-paper border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-void/50 text-[11px] font-semibold text-sand uppercase tracking-wider border-b border-line">
              <tr>
                <th className="px-5 py-3">Pincode</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Zone Tier</th>
                <th className="px-5 py-3">ETA Delivery</th>
                <th className="px-5 py-3">COD Allowed</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sand/60">
                    Loading pincode serviceability records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sand/60 font-sans">
                    No pincodes match your search filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="hover:bg-tint/30 transition">
                    <td className="px-5 py-3.5 font-bold text-cream">{row.pincode}</td>
                    <td className="px-5 py-3.5 font-sans text-cream/90">{row.state}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          row.zone === 'metro'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                            : row.zone === 'standard'
                            ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
                            : 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        }`}
                      >
                        {row.zone}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-sans text-sand">
                      {row.etaMinDays} - {row.etaMaxDays} Days
                    </td>
                    <td className="px-5 py-3.5">
                      {row.codAvailable ? (
                        <span className="text-emerald-400">✓ Enabled</span>
                      ) : (
                        <span className="text-sand/50">Prepaid Only</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-400 text-[10px] font-semibold border border-emerald-800/30">
                        Serviceable
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-paper border border-line rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-cream">Import Pincodes via CSV</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-sand hover:text-cream text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-sand/80 leading-relaxed">
              Paste comma-separated rows in the following format:
              <br />
              <code className="bg-void px-2 py-1 rounded text-gold block mt-1">
                pincode, state, zone (metro|standard|remote), etaMinDays, etaMaxDays, codAvailable
                (true|false)
              </code>
            </p>

            <textarea
              rows={8}
              placeholder="560001, Karnataka, metro, 2, 4, true&#10;110001, Delhi, metro, 2, 4, true&#10;795001, Manipur, remote, 6, 10, false"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full bg-void border border-line rounded-xl p-3 text-xs font-mono text-cream focus:border-gold focus:outline-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-medium text-sand hover:text-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={importing || !csvText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gold text-void hover:brightness-110 transition disabled:opacity-50 flex items-center gap-2"
              >
                {importing && <span className="animate-spin inline-block w-3 h-3 border border-void border-t-transparent rounded-full" />}
                Upload & Process Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
