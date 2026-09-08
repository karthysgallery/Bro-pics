'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { isValidStatusTransition, type Order, type OrderItem, type OrderStatus } from '@bro-pics/shared';

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'in_production',
  'printed_packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'replacement_issued',
];

interface QueueRow {
  id: string;
  orderNo: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  addressJson: { city?: string } | null;
}

export default function StaffOrdersPage() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus>('paid');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [orderNoInput, setOrderNoInput] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => {
        const role = result.claims.role;
        setAuthorized(role === 'admin' || role === 'staff');
      })
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading]);

  const loadOrder = async (orderNo: string) => {
    setError(null);
    setOrder(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNo}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      setError('Order not found.');
      return;
    }
    const body = await response.json();
    setOrder(body.order);
    setItems(body.items ?? []);
    setNextStatus('');
    setCourier('');
    setAwbNumber('');
  };

  useEffect(() => {
    if (authorized !== true) return;
    (async () => {
      const idToken = await user!.getIdToken();
      const response = await fetch(`/api/staff/orders?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setQueue(body.orders ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, statusFilter]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    await loadOrder(orderNoInput);
  };

  const handleQueueRowClick = async (orderNo: string) => {
    setOrderNoInput(orderNo);
    await loadOrder(orderNo);
  };

  const handleAdvance = async () => {
    if (!order || !nextStatus) return;
    setError(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNoInput}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ status: nextStatus, note, courier, awbNumber }),
    });
    if (!response.ok) {
      setError('Could not advance the order.');
      return;
    }
    const body = await response.json();
    setOrder(body.order);
    setNextStatus('');
    setNote('');
    setCourier('');
    setAwbNumber('');
  };

  const validNextStatuses = order ? ALL_STATUSES.filter((s) => isValidStatusTransition(order.status, s)) : [];

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Order Queue</h1>

      <label htmlFor="status-filter">Status</label>
      <select
        id="status-filter"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as OrderStatus)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <ul className="flex flex-col gap-1">
        {queue.map((row) => (
          <li key={row.id}>
            <button onClick={() => handleQueueRowClick(row.orderNo)} className="text-left underline">
              {row.orderNo}
            </button>
            {' — '}
            {row.addressJson?.city ?? ''}
          </li>
        ))}
      </ul>

      <h2 className="font-display text-xl pt-4 border-t border-charcoal/10">Order Lookup</h2>

      <label htmlFor="order-no-input">Order number</label>
      <input
        id="order-no-input"
        value={orderNoInput}
        onChange={(e) => setOrderNoInput(e.target.value)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      />
      <button onClick={handleLookup} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Look up
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {order && (
        <div className="flex flex-col gap-3 pt-4 border-t border-charcoal/10">
          <p>Current status: {order.status}</p>
          <ul>
            {items.map((item, i) => (
              <li key={i}>{item.title}</li>
            ))}
          </ul>

          <label htmlFor="next-status">Next status</label>
          <select
            id="next-status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
            className="rounded border border-charcoal/20 px-3 py-2 w-fit"
          >
            <option value="">Select…</option>
            {validNextStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label htmlFor="advance-note">Note (optional)</label>
          <textarea id="advance-note" value={note} onChange={(e) => setNote(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

          {nextStatus === 'shipped' && (
            <>
              <label htmlFor="courier-input">Courier</label>
              <input id="courier-input" value={courier} onChange={(e) => setCourier(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />
              <label htmlFor="awb-input">AWB / tracking number</label>
              <input id="awb-input" value={awbNumber} onChange={(e) => setAwbNumber(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />
            </>
          )}

          <button onClick={handleAdvance} disabled={!nextStatus} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
            Advance
          </button>
        </div>
      )}
    </main>
  );
}
