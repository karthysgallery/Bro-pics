'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { isValidReturnStatusTransition, type Return, type ReturnStatus } from '@bro-pics/shared';

const ALL_STATUSES: ReturnStatus[] = [
  'requested',
  'approved',
  'rejected',
  'pickup_scheduled',
  'picked_up',
  'refund_processing',
  'refunded',
];

function formatMoney(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Mirrors admin/orders/page.tsx's queue-and-advance shape — a return is a
// smaller lifecycle attached to an order (see packages/shared/src/schemas/
// return.ts), so the UI pattern is the same rather than inventing a new one.
export default function AdminReturnsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ReturnStatus>('requested');
  const [queue, setQueue] = useState<Return[]>([]);
  const [selected, setSelected] = useState<Return | null>(null);
  const [nextStatus, setNextStatus] = useState<ReturnStatus | ''>('');
  const [staffNote, setStaffNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setQueueError(null);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/staff/returns?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        setQueue([]);
        setQueueError('Could not load the queue.');
        return;
      }
      const body = await response.json();
      setQueue(body.returns ?? []);
    })();
  }, [user, statusFilter]);

  const handleSelect = (ret: Return) => {
    setSelected(ret);
    setNextStatus('');
    setStaffNote('');
    setError(null);
  };

  const handleAdvance = async () => {
    if (!selected || !nextStatus || !user) return;
    setError(null);
    setIsAdvancing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/staff/returns/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ status: nextStatus, staffNote: staffNote || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? 'Could not advance this return.');
        return;
      }
      setSelected((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setQueue((prev) => prev.filter((r) => r.id !== selected.id));
      setNextStatus('');
      setStaffNote('');
    } finally {
      setIsAdvancing(false);
    }
  };

  const validNextStatuses = selected ? ALL_STATUSES.filter((s) => isValidReturnStatusTransition(selected.status, s)) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-brown-dark">Returns Queue</h1>

      <label htmlFor="return-status-filter" className="text-sm text-brown/70">Status</label>
      <select
        id="return-status-filter"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as ReturnStatus)}
        className="rounded-lg border border-gold/30 px-3 py-2 w-fit"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {queueError && <p className="text-sm text-red-600">{queueError}</p>}

      <ul className="flex flex-col gap-1 text-brown/80">
        {queue.map((ret) => (
          <li key={ret.id}>
            <button onClick={() => handleSelect(ret)} className="text-left underline text-brown-dark">
              {ret.orderId}
            </button>
            {' — '}
            {ret.reason}
            {' — '}
            {formatMoney(ret.refundAmount)}
          </li>
        ))}
        {queue.length === 0 && !queueError && <li>No returns in this status.</li>}
      </ul>

      {selected && (
        <div className="flex flex-col gap-3 pt-4 border-t border-gold/30">
          <p className="text-brown-dark">Order: {selected.orderId}</p>
          <p className="text-brown/80">Reason: {selected.reason}</p>
          <p className="text-brown/80">Refund amount: {formatMoney(selected.refundAmount)}</p>
          <p className="text-brown-dark">Current status: {selected.status}</p>

          <label htmlFor="return-next-status" className="text-sm text-brown/70">Next status</label>
          <select
            id="return-next-status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as ReturnStatus)}
            className="rounded-lg border border-gold/30 px-3 py-2 w-fit"
          >
            <option value="">Select…</option>
            {validNextStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label htmlFor="return-staff-note" className="text-sm text-brown/70">Staff note (optional)</label>
          <textarea
            id="return-staff-note"
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            className="rounded-lg border border-gold/30 px-3 py-2"
          />

          {nextStatus === 'refunded' && (
            <p className="text-sm text-red-700">
              This will call Razorpay&apos;s refund API for {formatMoney(selected.refundAmount)} — real money movement.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleAdvance}
            disabled={!nextStatus || isAdvancing}
            className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-4 py-2 w-fit disabled:opacity-50"
          >
            {isAdvancing ? 'Working…' : 'Advance'}
          </button>
        </div>
      )}
    </div>
  );
}
