'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/auth-context';

interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  resource: string;
  resourceId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export default function AuditTrailPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorSearch, setActorSearch] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (actorSearch) params.set('actor', actorSearch);
      if (resourceFilter) params.set('resource', resourceFilter);

      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [user, resourceFilter]);

  const handleExportCsv = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/audit/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
      }
    } catch (err) {
      console.error('Failed to export CSV', err);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-cream">Security & Audit Trail</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gold/10 text-gold border border-gold/30">
              Append-Only Ledger
            </span>
          </div>
          <p className="text-sm text-sand/70 mt-1">
            Immutable log of all administrative actions, permissions grants, refunds, catalogue changes, and order transitions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-charcoal hover:bg-tint border border-line text-cream flex items-center gap-2 transition"
          >
            <span>📥</span> Export Audit CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-paper border border-line flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 flex items-center gap-2 w-full">
          <input
            type="text"
            placeholder="Search by Actor UID / Staff ID..."
            value={actorSearch}
            onChange={(e) => setActorSearch(e.target.value)}
            className="flex-1 bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream font-mono focus:border-gold focus:outline-none"
          />
          <button
            onClick={fetchLogs}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream transition"
          >
            Filter
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
          >
            <option value="">All Resources</option>
            <option value="product">Products</option>
            <option value="order">Orders</option>
            <option value="refund">Refunds</option>
            <option value="settings">Store Settings</option>
            <option value="staff">Staff & Roles</option>
            <option value="coupon">Coupons</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl bg-paper border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-void/50 text-[11px] font-semibold text-sand uppercase tracking-wider border-b border-line">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Actor UID</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Resource Type</th>
                <th className="px-5 py-3">Resource ID</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sand/60">
                    Loading audit trail events...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sand/60 font-sans">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="hover:bg-tint/30 transition">
                    <td className="px-5 py-3.5 text-sand/80 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString([], {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-cream font-bold truncate max-w-[120px]">
                      {row.actorUid}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gold/10 text-gold border border-gold/30">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 uppercase text-sand text-[10px]">
                      {row.resource}
                    </td>
                    <td className="px-5 py-3.5 text-cream truncate max-w-[140px]">
                      {row.resourceId}
                    </td>
                    <td className="px-5 py-3.5 text-right font-sans">
                      {row.details ? (
                        <button
                          onClick={() => setSelectedLog(row)}
                          className="text-xs text-gold hover:underline"
                        >
                          View Diff →
                        </button>
                      ) : (
                        <span className="text-sand/40 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details / Diff Modal */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-paper border border-line rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-sm font-bold text-cream font-mono">
                  {selectedLog.action}
                </h3>
                <div className="text-[11px] text-sand/60">
                  Target: {selectedLog.resource} / {selectedLog.resourceId}
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-sand hover:text-cream text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-sand">Payload & State Diff:</div>
              <pre className="p-4 rounded-xl bg-void border border-line text-xs font-mono text-emerald-400 overflow-x-auto max-h-72">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-tint border border-line text-cream hover:border-gold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
