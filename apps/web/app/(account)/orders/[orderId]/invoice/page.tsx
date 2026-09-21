'use client';

import { useEffect, useState } from 'react';
import { SignedOutNotice } from '../../../../../components/account/SignedOutNotice';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../../lib/firebase-client';
import { PageSkeleton } from '../../../../../components/ui/Skeleton';
import type { Order, OrderItem, Address } from '@bro-pics/shared';

interface InvoicePageProps {
  params: Promise<{ orderId: string }>;
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPlacedAt(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString('en-IN');
  }
  if (value instanceof Date) return value.toLocaleDateString('en-IN');
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-IN');
  }
  return '';
}

// A print-friendly order-detail view — the frontend-only equivalent of a
// downloadable invoice: no PDF-generation library exists in this stack, so
// "download" is the browser's own print-to-PDF against this page. Built
// entirely from data the order-detail page already fetches, just re-fetched
// here since this is a separate route.
export default function InvoicePage({ params }: InvoicePageProps) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);

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
  }, [uid, orderId]);

  if (!user) return <SignedOutNotice action="view this invoice" />;
  if (!order) return <PageSkeleton rows={2} />;

  const address = order.addressJson as unknown as Address;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-6 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold text-ink">Invoice — {order.orderNo}</h1>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-gold text-ink px-4 py-2 text-sm font-semibold hover:bg-gold-deep transition-colors"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">BroPics — Invoice</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-ink/60">Order no.</p>
          <p className="text-ink font-medium">{order.orderNo}</p>
        </div>
        <div>
          <p className="text-ink/60">Order date</p>
          <p className="text-ink font-medium">{formatPlacedAt(order.placedAt)}</p>
        </div>
        <div>
          <p className="text-ink/60">Payment reference</p>
          <p className="text-ink font-medium">{order.razorpayPaymentId ?? order.razorpayOrderId ?? '—'}</p>
        </div>
        <div>
          <p className="text-ink/60">Payment status</p>
          <p className="text-ink font-medium capitalize">{order.paymentStatus}</p>
        </div>
      </div>

      {address && (
        <div className="text-sm border-t border-line pt-4">
          <p className="text-ink/60 mb-1">Shipping address</p>
          <p className="text-ink">
            {address.label && <span className="font-medium">{address.label}<br /></span>}
            {address.line1}
            {address.line2 && <>, {address.line2}</>}
            <br />
            {address.city}, {address.state} {address.pincode}
            <br />
            {address.phone}
          </p>
        </div>
      )}

      <table className="w-full text-sm border-t border-line pt-4">
        <thead>
          <tr className="text-left text-ink/60">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-2 text-ink">{item.title}</td>
              <td className="py-2 text-right text-ink">{item.qty}</td>
              <td className="py-2 text-right text-ink">{formatPaise(item.unitPrice)}</td>
              <td className="py-2 text-right text-ink">{formatPaise(item.unitPrice * item.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col items-end gap-1 text-sm border-t border-line pt-4">
        <div className="flex justify-between w-48">
          <span className="text-ink/60">Subtotal</span>
          <span className="text-ink">{formatPaise(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between w-48">
            <span className="text-ink/60">Discount</span>
            <span className="text-ink">−{formatPaise(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between w-48">
          <span className="text-ink/60">Shipping</span>
          <span className="text-ink">{formatPaise(order.shipping)}</span>
        </div>
        {order.taxLines.map((tax, i) => (
          <div key={i} className="flex justify-between w-48">
            <span className="text-ink/60">Tax{tax.gstin ? ` (${tax.gstin})` : ''}</span>
            <span className="text-ink">{formatPaise(tax.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between w-48 font-semibold pt-1 border-t border-line">
          <span className="text-ink">Total</span>
          <span className="text-ink">{formatPaise(order.total)}</span>
        </div>
      </div>
    </main>
  );
}
