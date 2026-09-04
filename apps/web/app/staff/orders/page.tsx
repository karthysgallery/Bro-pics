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

export default function StaffOrdersPage() {
  const { user } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orderNoInput, setOrderNoInput] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdTokenResult().then((result) => {
      const role = result.claims.role;
      setAuthorized(role === 'admin' || role === 'staff');
    });
    // Keyed on uid (not the user object itself) because the object reference
    // is not guaranteed stable across renders, and we only need to redo this
    // check when the signed-in identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    setError(null);
    setOrder(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNoInput}`, {
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
      <h1 className="font-display text-2xl">Order Lookup</h1>

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
