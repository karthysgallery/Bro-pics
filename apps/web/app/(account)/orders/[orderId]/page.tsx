'use client';

import { useEffect, useState } from 'react';
import { getFirestore, doc, getDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import type { Order, OrderItem, OrderEvent } from '@bro-pics/shared';

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

// order.placedAt comes back from the client Firestore SDK as a Timestamp
// object (with a toDate() method), not a plain Date or ISO string, so this
// duck-types rather than assuming a specific shape.
function formatPlacedAt(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString('en-IN');
  }
  if (value instanceof Date) return value.toLocaleString('en-IN');
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('en-IN');
  }
  return '';
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);

  useEffect(() => {
    params.then((p) => setOrderId(p.orderId));
  }, [params]);

  useEffect(() => {
    if (!uid || !orderId) return;
    const db = getFirestore(getFirebaseApp());

    getDoc(doc(db, 'orders', orderId)).then((snapshot) => {
      if (snapshot.exists()) setOrder(snapshot.data() as Order);
    });
    getDocs(collection(db, 'orders', orderId, 'items')).then((snapshot) => {
      setItems(snapshot.docs.map((d) => d.data() as OrderItem));
    });
    getDocs(query(collection(db, 'orders', orderId, 'events'), orderBy('createdAt', 'asc'))).then((snapshot) => {
      setEvents(snapshot.docs.map((d) => d.data() as OrderEvent));
    });
  }, [uid, orderId]);

  if (!user) return <p>Please sign in to see this order.</p>;
  if (!order) return <p>Loading…</p>;

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-2xl">Order {order.orderNo}</h1>

      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i}>
            <span>{item.title}</span> × {item.qty}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-4 border-t border-charcoal/10">
        <h2 className="font-medium">Status timeline</h2>
        <div className="text-sm">
          <span>Order placed</span>
          {order.placedAt !== undefined && <span> — <span>{formatPlacedAt(order.placedAt)}</span></span>}
        </div>
        {events.map((event) => (
          <div key={event.id} className="text-sm">
            <span>{event.status}</span>
            {event.note && (
              <span> — <span>{event.note}</span></span>
            )}
            {event.courier && (
              <span> — <span>{event.courier}</span></span>
            )}
            {event.awbNumber && (
              <span> (<span>{event.awbNumber}</span>)</span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
