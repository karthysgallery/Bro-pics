'use client';

import { useEffect, useState } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp } from '../../lib/firebase-client';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { AddressPicker } from '../../components/checkout/AddressPicker';
import { loadRazorpayCheckoutScript } from '../../lib/razorpay-checkout-script';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type OrderStatus = { status?: string; paymentStatus?: string; orderNo?: string } | null;

export default function CheckoutPage() {
  const { user } = useAuth();
  const { items, totalPaise } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(null);

  // Subscribe to orders/{orderId} once an order has been created, so the
  // page can detect the webhook flipping status to 'paid' and show a real
  // confirmation instead of re-rendering with whatever the live cart
  // listener (cart-context.tsx) now shows — which goes empty the moment
  // the webhook clears the cart on a successful payment. The effect's own
  // cleanup (returned below) unsubscribes both on unmount and whenever
  // orderId changes, so no separate ref/teardown bookkeeping is needed.
  useEffect(() => {
    if (!orderId) return;
    const db = getFirestore(getFirebaseApp());
    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(orderRef, (snapshot) => {
      if (!snapshot.exists()) return;
      // Read fields directly off the raw snapshot data rather than
      // OrderSchema.parse(...) — Firestore returns placedAt as a Timestamp,
      // not a JS Date, so OrderSchema's z.date() would fail here. This is a
      // read-only UI concern, not a write boundary, so no schema validation
      // is needed.
      const data = snapshot.data() as { status?: string; paymentStatus?: string; orderNo?: string };
      setOrderStatus({ status: data.status, paymentStatus: data.paymentStatus, orderNo: data.orderNo });
    });
    return unsubscribe;
  }, [orderId]);

  if (!user) {
    return <p>Please sign in to check out.</p>;
  }

  const handlePlaceOrder = async () => {
    if (!addressId) {
      setError('Please choose or add a delivery address.');
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ addressId }),
      });

      if (response.status === 409) {
        setError('Some items in your cart are no longer available. Please review your cart and try again.');
        return;
      }
      if (!response.ok) {
        setError('Could not place your order. Please try again.');
        return;
      }

      const { orderId: newOrderId, razorpayOrderId, amount, keyId } = await response.json();
      setOrderStatus(null);
      setOrderId(newOrderId);

      await loadRazorpayCheckoutScript();
      const razorpay = new window.Razorpay({
        key: keyId,
        amount,
        currency: 'INR',
        order_id: razorpayOrderId,
        name: 'BroPics',
        handler: () => {
          // Intentionally does nothing beyond letting the user know payment
          // is being confirmed — the order-status listener above (driven by
          // the webhook, the actual source of truth) is what flips the UI
          // to a real confirmation, not this client-side callback.
        },
      });
      razorpay.open();
    } finally {
      setPlacing(false);
    }
  };

  const isPaid = orderStatus?.status === 'paid';
  const isFailed = orderStatus?.paymentStatus === 'failed';

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-2xl">Checkout</h1>

      {isPaid ? (
        // Once the order-status listener sees status flip to 'paid', this
        // REPLACES the cart summary rather than sitting next to it — the
        // cart legitimately goes empty once the webhook clears it, and
        // showing that alongside "payment confirmed" would look like the
        // order itself had vanished.
        <p className="text-sm text-charcoal/70">
          Payment confirmed! Your order {orderStatus?.orderNo ?? orderId} is being processed.
        </p>
      ) : (
        <>
          <AddressPicker userId={user.uid} onSelect={setAddressId} />

          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <div key={`${item.variantId}-${item.personalizationId}`} className="flex justify-between text-sm">
                <span>{item.title} × {item.qty}</span>
              </div>
            ))}
            <div className="flex justify-between font-medium pt-2 border-t border-charcoal/10">
              <span>Subtotal</span>
              <span>₹{(totalPaise / 100).toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {isFailed && (
            // The Place Order button stays hidden for the rest of this page's
            // lifetime once orderId is set (Fix 2, closing the double-submit
            // window), so this can't offer an in-place retry button — point
            // the user at a refresh instead of implying a button that isn't
            // there.
            <p className="text-sm text-red-600">Payment failed. Please refresh the page to try again.</p>
          )}
          {orderId && !isFailed && (
            <p className="text-sm text-charcoal/70">Order {orderId} created — complete payment in the window that opened.</p>
          )}

          {!orderId && (
            <button onClick={handlePlaceOrder} disabled={placing} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
              Place Order
            </button>
          )}
        </>
      )}
    </main>
  );
}
