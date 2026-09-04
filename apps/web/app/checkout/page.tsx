'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { AddressPicker } from '../../components/checkout/AddressPicker';
import { loadRazorpayCheckoutScript } from '../../lib/razorpay-checkout-script';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function CheckoutPage() {
  const { user } = useAuth();
  const { items, totalPaise } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

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
          // is being confirmed — the order-status listener below (driven by
          // the webhook, the actual source of truth) is what flips the UI
          // to a real confirmation, not this client-side callback.
        },
      });
      razorpay.open();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-2xl">Checkout</h1>

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
      {orderId && <p className="text-sm text-charcoal/70">Order {orderId} created — complete payment in the window that opened.</p>}

      <button onClick={handlePlaceOrder} disabled={placing} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Place Order
      </button>
    </main>
  );
}
