'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../lib/auth-context';
import { getFirebaseApp } from '../../../lib/firebase-client';
import type { Order } from '@bro-pics/shared';

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: Order }> | null>(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getFirebaseApp());
    const q = query(collection(db, 'orders'), where('userId', '==', uid), orderBy('placedAt', 'desc'));
    getDocs(q).then((snapshot) => {
      setOrders(snapshot.docs.map((d) => ({ id: d.id, data: d.data() as Order })));
    });
  }, [uid]);

  if (!user) return <p>Please sign in to see your orders.</p>;
  if (orders === null) return <p>Loading…</p>;

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Your Orders</h1>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map(({ id, data }) => (
            <li key={id}>
              <Link href={`/orders/${id}`} className="flex justify-between gap-4">
                <span>{data.orderNo}</span>
                <span>{data.status}</span>
                <span>₹{formatPaise(data.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
