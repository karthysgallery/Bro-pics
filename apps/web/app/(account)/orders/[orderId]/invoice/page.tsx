'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
    <main className="mx-auto w-full max-w-4xl px-4 md:px-6 py-6 md:py-8 flex flex-col gap-6 print:py-0 print:max-w-none print:px-0">
      {/* Breadcrumb & Action bar */}
      <div className="print:hidden">
        <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-3">
          <Link href="/" className="hover:text-ink">Home</Link>
          {' / '}
          <Link href="/orders" className="hover:text-ink">Orders</Link>
          {' / '}
          <span className="text-ink font-medium">Invoice</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-1">Tax invoice</h1>
            <p className="text-xs text-ink/70">
              {order.invoiceNo ? `Invoice ${order.invoiceNo} · ` : ''}Order {order.orderNo} · {formatPlacedAt(order.placedAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="rounded-full bg-gold hover:bg-gold-deep text-ink px-5 py-2 text-xs font-semibold transition-colors"
            >
              Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-full border border-line bg-surface hover:bg-tint/40 text-ink px-5 py-2 text-xs font-semibold transition-colors"
            >
              Print invoice
            </button>
          </div>
        </div>
      </div>

      {/* Main Invoice Sheet */}
      <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0">
        {/* Header: Company & Customer info */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-line">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">BroPics</h2>
            <p className="text-xs text-ink/70">BroPics India Private Limited</p>
            <p className="text-xs text-ink/70">18, Craft Lane, Bengaluru, Karnataka 560001</p>
            <p className="text-xs text-ink/70 mt-1">GSTIN 29AALCB1042P1Z8</p>
          </div>

          <div className="sm:text-right">
            <p className="text-2xs font-bold uppercase tracking-wider text-ink/50 mb-1">BILL TO / SHIP TO</p>
            {address ? (
              <>
                <p className="text-xs font-semibold text-ink">{address.label || 'Recipient'}</p>
                <p className="text-xs text-ink/70">
                  {address.line1}{address.line2 ? `, ${address.line2}` : ''}
                </p>
                <p className="text-xs text-ink/70">
                  {address.city}, {address.state} {address.pincode}
                </p>
                <p className="text-xs text-ink/70 mt-1">Place of supply: {address.state || 'Karnataka'}</p>
              </>
            ) : (
              <p className="text-xs text-ink/70">Digital order</p>
            )}
          </div>
        </div>

        {/* Invoice Meta Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-line text-xs">
          <div>
            <p className="text-ink/50 text-2xs uppercase">Order no.</p>
            <p className="text-ink font-semibold mt-0.5">{order.orderNo}</p>
          </div>
          <div>
            <p className="text-ink/50 text-2xs uppercase">Order date</p>
            <p className="text-ink font-semibold mt-0.5">{formatPlacedAt(order.placedAt)}</p>
          </div>
          {order.invoiceNo && (
            <div>
              <p className="text-ink/50 text-2xs uppercase">Invoice no.</p>
              <p className="text-ink font-semibold mt-0.5">{order.invoiceNo}</p>
            </div>
          )}
          <div>
            <p className="text-ink/50 text-2xs uppercase">Payment status</p>
            <p className="text-ink font-semibold capitalize mt-0.5">{order.paymentStatus}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="my-6 border border-line rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-tint/60 text-ink/80 border-b border-line">
              <tr className="text-left font-semibold">
                <th className="p-3">Item</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">Unit price</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-tint/20">
                  <td className="p-3 font-medium text-ink">
                    {item.title}
                  </td>
                  <td className="p-3 text-right text-ink font-medium">{item.qty}</td>
                  <td className="p-3 text-right text-ink/70">{formatPaise(item.unitPrice)}</td>
                  <td className="p-3 text-right text-ink font-semibold">{formatPaise(item.unitPrice * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Breakdown & Payment Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-line text-xs">
          <div className="space-y-1 text-ink/70">
            <p className="font-semibold text-ink">
              Paid via {order.razorpayPaymentId ? 'Online Payment' : 'UPI / Card'} · {formatPlacedAt(order.placedAt)}
            </p>
            <p className="text-2xs text-ink/60">
              Reference: {order.razorpayPaymentId ?? order.razorpayOrderId ?? '—'}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex justify-between w-64 text-ink/70">
              <span>Subtotal</span>
              <span className="text-ink font-medium">{formatPaise(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between w-64 text-ink/70">
                <span>Discount</span>
                <span className="text-ink font-medium">−{formatPaise(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between w-64 text-ink/70">
              <span>Shipping</span>
              <span className="text-ink font-medium">{order.shipping === 0 ? 'Free' : formatPaise(order.shipping)}</span>
            </div>
            {order.taxLines.map((tax, i) => (
              <div key={i} className="flex flex-col gap-1 w-64 pt-1 border-t border-line/60">
                <div className="flex justify-between text-ink/70">
                  <span>Taxable value</span>
                  <span className="text-ink">{formatPaise(order.total - tax.amount)}</span>
                </div>
                <div className="flex justify-between text-ink/70">
                  <span>GST @ {tax.rate}%{tax.gstin ? ` (${tax.gstin})` : ''}</span>
                  <span className="text-ink">{formatPaise(tax.amount)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between w-64 font-bold pt-2 border-t border-line text-base text-ink">
              <span>Total paid</span>
              <span className="font-display text-lg">{formatPaise(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <p className="mt-8 pt-4 border-t border-line text-2xs text-ink/50 text-center sm:text-left">
          Computer-generated invoice. Personalised goods are covered by our damage and manufacturing-defect policy.
        </p>
      </div>
    </main>
  );
}
