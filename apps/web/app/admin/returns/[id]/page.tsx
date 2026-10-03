'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { formatPaise } from '../../../../lib/format-price';
import { StatusChip } from '../../../../components/admin/StatusChip';
import Link from 'next/link';

interface ReturnDetail {
  return: {
    id: string;
    orderId: string;
    userId: string;
    status: string;
    reason: string;
    customerNote?: string;
    staffNote?: string;
    photoUrls?: string[];
    evidenceUrls?: string[];
    createdAt: string;
    resolution?: 'refund' | 'replacement';
  };
  events: Array<{
    id?: string;
    status: string;
    staffNote?: string;
    createdAt: string;
  }>;
  order?: {
    id: string;
    orderNo: string;
    total: number;
    placedAt: string;
    addressJson?: any;
  };
}

export default function ReturnDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const [data, setData] = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [staffNote, setStaffNote] = useState('');
  const [resolutionChoice, setResolutionChoice] = useState<'refund' | 'replacement'>('refund');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchReturn = async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/returns/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        throw new Error('Return request not found');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load return details' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturn();
  }, [user, id]);

  const handleResolve = async (action: 'approved' | 'rejected') => {
    if (!user) return;
    setResolving(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const payload: any = {
        status: action,
        staffNote: staffNote.trim() || undefined,
      };
      if (action === 'approved') {
        payload.resolution = resolutionChoice;
      }

      const res = await fetch(`/api/staff/returns/${id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update return request');
      }

      setMessage({
        type: 'success',
        text: `Return request ${action === 'approved' ? `approved for ${resolutionChoice}` : 'rejected'}.`,
      });
      fetchReturn();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Resolution failed' });
    } finally {
      setResolving(false);
    }
  };

  if (loading && !data) {
    return <div className="p-8 text-center text-sand/60">Loading return request details...</div>;
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-rose-400 bg-paper rounded-2xl border border-line">
        Return request not found.
      </div>
    );
  }

  const ret = data.return;
  const photos = ret.photoUrls || ret.evidenceUrls || [];

  return (
    <div className="space-y-6 max-w-5xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/returns" className="text-sand hover:text-cream text-sm">
              ← Back to Returns
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold tracking-tight text-cream">Return Request #{ret.id}</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                ret.status === 'refunded' || ret.status === 'approved'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                  : ret.status === 'rejected'
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
              }`}
            >
              {ret.status}
            </span>
          </div>
        </div>

        {data.order && (
          <Link
            href={`/admin/orders/${data.order.id}`}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream transition"
          >
            Inspect Order #{data.order.orderNo || data.order.id} →
          </Link>
        )}
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

      {/* Grid: Reason & Evidence Photos (Left) + Actions & Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Return Details & Photos */}
        <div className="lg:col-span-7 space-y-6">
          {/* Reason Card */}
          <div className="p-6 rounded-2xl bg-paper border border-line space-y-4">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
              Claim Summary
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-sand/50">Return Reason Code:</span>{' '}
                <span className="font-bold text-cream uppercase">{ret.reason}</span>
              </div>
              {ret.customerNote && (
                <div className="p-3 rounded-xl bg-void/60 border border-line">
                  <div className="text-sand/50 mb-1">Customer Explanation:</div>
                  <div className="text-cream text-sm">{ret.customerNote}</div>
                </div>
              )}
              <div>
                <span className="text-sand/50">Requested Date:</span>{' '}
                <span className="text-cream">
                  {new Date(ret.createdAt).toLocaleString([], {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Evidence Photos Lightbox */}
          <div className="p-6 rounded-2xl bg-paper border border-line space-y-4">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
              Customer Uploaded Evidence ({photos.length})
            </h3>
            {photos.length === 0 ? (
              <div className="text-xs text-sand/60 py-4">No evidence photos were attached.</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((url, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedPhoto(url)}
                    className="relative aspect-square rounded-xl overflow-hidden bg-void border border-line cursor-pointer hover:border-gold group transition"
                  >
                    <img
                      src={url}
                      alt={`Evidence ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute inset-0 bg-void/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-cream transition">
                      🔍 Enlarge
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: Resolution Panel & History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Resolution Action Card (if requested/pending) */}
          {ret.status === 'requested' || ret.status === 'pending' ? (
            <div className="p-6 rounded-2xl bg-paper border border-gold/40 space-y-4 shadow-xl shadow-gold/5">
              <h3 className="text-sm font-bold text-gold border-b border-line pb-2">
                Staff Review & Decision
              </h3>

              <div>
                <label className="block text-xs font-semibold text-sand mb-2">
                  Resolution Mode (on Approval)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolutionChoice('refund')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                      resolutionChoice === 'refund'
                        ? 'bg-gold text-void border-gold'
                        : 'bg-void text-cream border-line hover:border-sand'
                    }`}
                  >
                    💰 Refund Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionChoice('replacement')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                      resolutionChoice === 'replacement'
                        ? 'bg-gold text-void border-gold'
                        : 'bg-void text-cream border-line hover:border-sand'
                    }`}
                  >
                    🖼️ Free Remake
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-sand mb-1.5">
                  Internal Staff Note
                </label>
                <textarea
                  rows={3}
                  placeholder="Reason for approval / rejection..."
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  className="w-full bg-void border border-line rounded-xl p-2.5 text-xs text-cream focus:border-gold focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleResolve('rejected')}
                  disabled={resolving}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold bg-charcoal hover:bg-tint border border-line text-rose-400 hover:border-rose-400 transition disabled:opacity-50"
                >
                  Reject Claim
                </button>
                <button
                  onClick={() => handleResolve('approved')}
                  disabled={resolving}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 disabled:opacity-50"
                >
                  {resolving ? 'Submitting...' : `Approve (${resolutionChoice})`}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-paper border border-line space-y-3">
              <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
                Resolution State
              </h3>
              <div className="text-xs text-sand/80 space-y-1">
                <div>
                  Status: <span className="text-cream font-bold uppercase">{ret.status}</span>
                </div>
                {ret.resolution && (
                  <div>
                    Resolution: <span className="text-gold capitalize">{ret.resolution}</span>
                  </div>
                )}
                {ret.staffNote && (
                  <div className="mt-2 p-2 rounded bg-void/60 text-cream">
                    Note: {ret.staffNote}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline Events */}
          <div className="p-6 rounded-2xl bg-paper border border-line space-y-4">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-2">
              Events Timeline
            </h3>
            {data.events.length === 0 ? (
              <div className="text-xs text-sand/60">No transition events recorded yet.</div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {data.events.map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-gold">•</span>
                    <div>
                      <span className="font-bold text-cream uppercase">{ev.status}</span>
                      {ev.staffNote && (
                        <div className="font-sans text-sand/70 text-[11px]">{ev.staffNote}</div>
                      )}
                      <div className="text-[10px] text-sand/50">
                        {new Date(ev.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/90 backdrop-blur-md animate-in fade-in"
        >
          <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-line shadow-2xl">
            <img
              src={selectedPhoto}
              alt="Enlarged evidence"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 px-3 py-1 bg-void/80 text-cream rounded-full text-xs font-bold border border-line"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
