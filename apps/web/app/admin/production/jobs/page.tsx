'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import Link from 'next/link';

interface PrintJob {
  id: string;
  orderId: string;
  itemId: string;
  personalizationId: string;
  status: 'queued' | 'leased' | 'done' | 'failed' | 'failed_permanent';
  attempts: number;
  renderedFilePath?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export default function PrintJobsQueuePage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchJobs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/production/jobs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setJobs(json.jobs || []);
      }
    } catch (err) {
      console.error('Failed to load print jobs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [user, statusFilter]);

  const handleRetry = async (jobId: string) => {
    if (!user) return;
    setRetryingId(jobId);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/production/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to requeue print job');
      }

      setMessage({ type: 'success', text: `Print Job #${jobId} re-queued for processing!` });
      fetchJobs();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Retry failed' });
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-cream">Print Rendering Jobs & DLQ</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              Cloud Run Sharp Engine
            </span>
          </div>
          <p className="text-sm text-sand/70 mt-1">
            Real-time pipeline monitor for 300 DPI multi-slot photo compositing, error inspection, and Dead Letter Queue retries.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="leased">Processing (Leased)</option>
            <option value="done">Completed (Done)</option>
            <option value="failed">Retrying (Failed)</option>
            <option value="failed_permanent">DLQ (Permanently Failed)</option>
          </select>
          <button
            onClick={fetchJobs}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream transition"
          >
            Refresh
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

      {/* Jobs Table */}
      <div className="rounded-2xl bg-paper border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-void/50 text-[11px] font-semibold text-sand uppercase tracking-wider border-b border-line">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Attempts</th>
                <th className="px-5 py-3">Output Artifact / Error</th>
                <th className="px-5 py-3">Queued At</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sand/60">
                    Loading print rendering jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sand/60">
                    No print rendering jobs match filter.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-tint/30 transition font-mono">
                    <td className="px-5 py-3.5 font-bold text-cream truncate max-w-[120px]">
                      {j.id}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/orders/${j.orderId}`}
                        className="text-gold hover:underline font-bold"
                      >
                        {j.orderId}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          j.status === 'done'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                            : j.status === 'leased'
                            ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
                            : j.status === 'queued'
                            ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                            : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-cream">{j.attempts} / 5</td>
                    <td className="px-5 py-3.5 max-w-xs truncate">
                      {j.renderedFilePath ? (
                        <span className="text-emerald-400">{j.renderedFilePath}</span>
                      ) : j.lastError ? (
                        <span className="text-rose-400 font-sans">{j.lastError}</span>
                      ) : (
                        <span className="text-sand/50 font-sans">Pending worker lease...</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sand/70">
                      {new Date(j.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right font-sans">
                      {j.status.startsWith('failed') && (
                        <button
                          onClick={() => handleRetry(j.id)}
                          disabled={retryingId === j.id}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-gold text-void hover:brightness-110 transition disabled:opacity-50"
                        >
                          {retryingId === j.id ? 'Requeuing...' : 'Retry Job'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
