'use client';

import { useEffect, useState } from 'react';
import { formatPaise } from '../../lib/format-price';
import { SignedOutNotice } from '../../components/account/SignedOutNotice';
import { EmptyState } from '../../components/ui/EmptyState';
import Link from 'next/link';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp } from '../../lib/firebase-client';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { AddressPicker } from '../../components/checkout/AddressPicker';
import { PincodeChecker } from '../../components/checkout/PincodeChecker';
import type { Address } from '@bro-pics/shared';
import { loadRazorpayCheckoutScript } from '../../lib/razorpay-checkout-script';
import { calculateShipping, DELIVERY_METHODS, DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from '../../lib/checkout-calc';
import { getShippingSettingsClient } from '../../lib/shipping-settings-client';
import { getOrCreateCheckoutIdempotencyKey, clearCheckoutIdempotencyKey } from '../../lib/checkout-idempotency-key';
import { TRANSIT_DAYS_MIN, TRANSIT_DAYS_MAX } from '../../components/product/DeliveryTimeline';
import type { DeliveryMethod } from '@bro-pics/shared';

const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = { standard: 'Standard', express: 'Express' };
// Only the courier-transit portion changes by method — production/dispatch
// time is per-product and not shortened by paying for faster shipping (see
// checkout-calc.ts's DELIVERY_METHODS comment for why same-day isn't offered).
const EXPRESS_TRANSIT_DAYS_MIN = 1;
const EXPRESS_TRANSIT_DAYS_MAX = 2;

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type OrderStatus = { status?: string; paymentStatus?: string; orderNo?: string } | null;

const COUPON_REASON_MESSAGES: Record<string, string> = {
  below_min_order: 'Minimum order not met',
  expired: "This coupon isn't active right now",
  not_started: "This coupon isn't active right now",
  usage_limit_reached: 'This coupon has reached its usage limit',
  per_user_limit_reached: 'This coupon has reached its usage limit',
};

export default function CheckoutPage() {
  const { user } = useAuth();
  const { items, totalPaise, clearCart } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [selectedAddressPincode, setSelectedAddressPincode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPaise: number; freeShipping: boolean } | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  // Starts at the same default constant used server-side, so there's
  // nothing to mismatch between server and client render — only upgraded
  // (in an effect, below) if settings/shipping actually overrides it.
  const [shippingSettings, setShippingSettings] = useState<Required<ShippingSettings>>(DEFAULT_SHIPPING_SETTINGS);

  useEffect(() => {
    getShippingSettingsClient().then(setShippingSettings);
  }, []);

  // Subscribe to orders/{orderId} once an order has been created, so the
  // page can detect the webhook flipping status to 'paid' and show a real
  // confirmation instead of re-rendering with whatever the live cart
  // listener (cart-context.tsx) now shows — which goes empty the moment
  // the webhook clears the cart on a successful payment. The effect's own
  // cleanup (returned below) unsubscribes both on unmount and whenever
  // orderId changes, so no separate ref/teardown bookkeeping is needed.
  useEffect(() => {
    // Also re-run (and tear down) this effect when the signed-in user
    // changes — e.g. the account-icon Sign Out button on this page's own
    // Header can flip `user` to null mid-checkout while a listener is live.
    // Without `user?.uid` in the deps, the effect wouldn't re-run on sign-out
    // and its cleanup (unsubscribe) would never fire, leaking a listener
    // that keeps running with now-invalid permissions.
    if (!orderId || !user?.uid) {
      setOrderStatus(null);
      return;
    }
    const db = getFirestore(getFirebaseApp());
    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        // Read fields directly off the raw snapshot data rather than
        // OrderSchema.parse(...) — Firestore returns placedAt as a Timestamp,
        // not a JS Date, so OrderSchema's z.date() would fail here. This is a
        // read-only UI concern, not a write boundary, so no schema validation
        // is needed.
        const data = snapshot.data() as { status?: string; paymentStatus?: string; orderNo?: string };
        setOrderStatus({ status: data.status, paymentStatus: data.paymentStatus, orderNo: data.orderNo });
        // This attempt is done — a NEXT, unrelated purchase should mint its
        // own fresh idempotency key, not keep reusing this completed one.
        if (data.status === 'paid') clearCheckoutIdempotencyKey();
      },
      (error) => {
        console.error('Order listener failed:', error);
        setError('Lost connection while confirming your order. Refresh to check its status.');
      }
    );
    return unsubscribe;
  }, [orderId, user?.uid]);

  if (!user) {
    return <SignedOutNotice action="check out" />;
  }

  // [FE-01] Direct navigation to /checkout with an empty cart (a stale
  // bookmark, or the back button after the webhook clears the cart on a
  // successful order) used to render the full address/payment form with a
  // zero-item, zero-total order. `!orderId` keeps this from also firing
  // right after a real order is placed, when the cart legitimately empties.
  if (items.length === 0 && !orderId) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add something to your cart before checking out."
        action={
          <Link href="/" className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors">
            Continue shopping
          </Link>
        }
      />
    );
  }

  const handleApplyCoupon = async () => {
    setCouponMessage(null);
    const idToken = await user.getIdToken();
    const response = await fetch('/api/checkout/coupon/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ code: couponCodeInput }),
    });
    if (response.status === 404) {
      setCouponMessage('Invalid coupon code.');
      return;
    }
    if (!response.ok) {
      setCouponMessage('Could not apply this coupon.');
      return;
    }
    const body = await response.json();
    if (!body.valid) {
      setCouponMessage(COUPON_REASON_MESSAGES[body.reason] ?? 'This coupon cannot be applied.');
      return;
    }
    setAppliedCoupon({ code: couponCodeInput, discountPaise: body.discountPaise, freeShipping: body.freeShipping });
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponMessage(null);
  };

  // A retryable-in-place path for a failed payment, replacing the old
  // "refresh the page" instruction — the Razorpay modal may still be open
  // and retryable when this fires, so telling the customer to refresh was
  // actively misleading. Resetting orderId brings back the Place order
  // button so a fresh order (and a fresh Razorpay session) can be created
  // without leaving this page.
  const handleRetryAfterFailure = () => {
    setOrderId(null);
    setOrderStatus(null);
    setError(null);
  };

  const handlePlaceOrder = async () => {
    if (!addressId) {
      setError('Please choose or add a delivery address.');
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      const idToken = await user.getIdToken();
      // Stable across a double-click and across retries of THIS attempt
      // (a failed/closed Razorpay modal, then "Place Order" again) — see
      // lib/checkout-idempotency-key.ts. create-order returns the SAME
      // order/Razorpay order for a repeated key instead of a duplicate.
      const idempotencyKey = getOrCreateCheckoutIdempotencyKey();
      const response = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ addressId, couponCode: appliedCoupon?.code ?? undefined, deliveryMethod, idempotencyKey, items }),
      });

      if (response.status === 409) {
        const body = await response.json().catch(() => null);
        setError(
          body?.code === 'already_paid'
            ? 'This order has already been paid for.'
            : 'Some items in your cart are no longer available. Please review your cart and try again.'
        );
        if (body?.code === 'already_paid') clearCheckoutIdempotencyKey();
        return;
      }
      if (!response.ok) {
        setError('Could not place your order. Please try again.');
        return;
      }

      const { orderId: newOrderId, razorpayOrderId, amount, keyId, isMock, status: resStatus, orderNo: resOrderNo } = await response.json();
      setOrderStatus(null);
      setOrderId(newOrderId);

      if (isMock || resStatus === 'paid' || !keyId) {
        clearCart();
        setOrderStatus({ status: 'paid', paymentStatus: 'paid', orderNo: resOrderNo ?? newOrderId });
        clearCheckoutIdempotencyKey();
        return;
      }

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
    } catch {
      // [FE-01] A thrown fetch (offline/DNS/CORS) or a rejected
      // loadRazorpayCheckoutScript() used to propagate as an unhandled
      // rejection — the button re-enabled with zero explanation. Every
      // other failure path above already sets `error` before returning;
      // this is the same message for the one path that previously set none.
      setError('Could not place your order. Please check your connection and try again.');
    } finally {
      setPlacing(false);
    }
  };

  const isPaid = orderStatus?.status === 'paid';
  const isFailed = orderStatus?.paymentStatus === 'failed';
  const shippingCost = appliedCoupon?.freeShipping ? 0 : calculateShipping(totalPaise, shippingSettings, deliveryMethod);
  // Clamped for display only — the real order total is always recomputed
  // and clamped server-side (calculateCouponDiscount already caps a
  // discount at the subtotal); this just keeps the on-page summary honest
  // if a coupon's discount happens to exceed subtotal + shipping.
  const grandTotal = Math.max(0, totalPaise - (appliedCoupon?.discountPaise ?? 0) + shippingCost);

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Checkout</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">One step closer to your wall.</h1>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Bag / Delivery / Payment</p>
      </div>

      {isPaid ? (
        <div className="rounded-3xl bg-field border border-line p-8 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
            ✓
          </div>
          <h2 className="font-display text-2xl font-bold text-ink mb-2">Payment confirmed!</h2>
          <p className="text-sm text-ink/70 mb-6">
            Your order <strong>{orderStatus?.orderNo ?? orderId}</strong> is being processed and will be crafted with care.
          </p>
          <Link
            href="/orders"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gold text-ink font-semibold text-sm hover:bg-gold-deep transition-colors"
          >
            Track your order
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Left: Step Cards */}
          <div className="space-y-6">
            {/* Step 01: Contact */}
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">01 · Contact</h2>
              <div className="grid sm:grid-cols-2 gap-4 mb-3">
                <div>
                  <label htmlFor="contact-email" className="block text-2xs font-semibold text-ink/60 mb-1">Email</label>
                  <input
                    id="contact-email"
                    type="email"
                    defaultValue={user?.email ?? ''}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="contact-phone" className="block text-2xs font-semibold text-ink/60 mb-1">Mobile</label>
                  <input
                    id="contact-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    defaultValue={user?.phoneNumber ?? ''}
                    className="w-full px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <p className="text-2xs text-ink/50">Order updates and delivery alerts only.</p>
            </div>

            {/* Step 02: Delivery Address */}
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">02 · Delivery address</h2>
              <AddressPicker
                userId={user.uid}
                onSelect={setAddressId}
                onSelectAddress={(address: Address) => setSelectedAddressPincode(address.pincode)}
              />

              {selectedAddressPincode && (
                <div className="mt-4 pt-4 border-t border-line">
                  <PincodeChecker initialPincode={selectedAddressPincode} autoCheck />
                </div>
              )}

              {/* Delivery method options */}
              <div className="mt-6 pt-4 border-t border-line">
                <span className="block text-xs font-semibold text-ink mb-3">Delivery method</span>
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Delivery method">
                  {DELIVERY_METHODS.map((method) => {
                    const cost = method === 'express' ? shippingSettings.expressShippingCharge : calculateShipping(totalPaise, shippingSettings, 'standard');
                    const transitLabel =
                      method === 'express'
                        ? `${EXPRESS_TRANSIT_DAYS_MIN}-${EXPRESS_TRANSIT_DAYS_MAX} days after dispatch`
                        : `${TRANSIT_DAYS_MIN}-${TRANSIT_DAYS_MAX} days after dispatch`;
                    return (
                      <label
                        key={method}
                        className={`flex items-start justify-between gap-3 rounded-2xl border p-3.5 text-xs cursor-pointer transition-colors ${
                          deliveryMethod === method ? 'border-accent bg-accent/5' : 'border-line bg-field hover:border-ink/30'
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <input
                            type="radio"
                            name="delivery-method"
                            checked={deliveryMethod === method}
                            onChange={() => setDeliveryMethod(method)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-bold text-ink block">{DELIVERY_METHOD_LABEL[method]}</span>
                            <span className="text-2xs text-ink/60 mt-0.5 block">{transitLabel}</span>
                          </span>
                        </span>
                        <span className="font-bold text-ink">{cost === 0 ? 'Free' : formatPaise(cost)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 03: Payment */}
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">03 · Payment</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-4 py-2 rounded-full bg-ink text-paper text-xs font-medium">UPI / Cards / Net Banking</span>
              </div>
              <p className="text-xs text-ink/70">
                You will be redirected to the secure Razorpay payment gateway to pay with UPI (GPay, PhonePe, Paytm), credit/debit card, or net banking.
              </p>
            </div>
          </div>

          {/* Right: Order Summary Card */}
          <div className="rounded-3xl bg-paper border border-line p-6 lg:sticky lg:top-32 shadow-sm">
            <h2 className="font-display text-xl font-bold text-ink mb-4">Order summary</h2>

            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={`${item.variantId}-${item.personalizationId}`} className="flex justify-between text-xs text-ink/80">
                  <span className="truncate pr-2">{item.title} × {item.qty}</span>
                  <span className="font-semibold text-ink">{formatPaise(item.unitPriceSnapshot * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Coupon input */}
            <div className="my-4 pt-4 border-t border-line">
              <label htmlFor="coupon-code" className="block text-2xs text-ink/60 mb-1 font-semibold">Coupon code</label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-xs bg-tint/60 px-3 py-2 rounded-xl">
                  <span>
                    Coupon <strong>{appliedCoupon.code}</strong> applied
                  </span>
                  <button onClick={handleRemoveCoupon} className="text-2xs font-semibold text-accent hover:text-accent-dark underline">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="coupon-code"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value)}
                    placeholder="Enter code"
                    className="flex-1 px-4 py-2 rounded-xl border border-line bg-field text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={!couponCodeInput}
                    className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-medium hover:bg-ink/80 disabled:opacity-40 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponMessage && <p className="text-2xs text-alert mt-1.5">{couponMessage}</p>}
            </div>

            <div className="space-y-2 py-4 border-t border-line text-xs">
              <div className="flex justify-between text-ink/70">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{formatPaise(totalPaise)}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Shipping</span>
                <span className="font-medium text-ink">{shippingCost === 0 ? 'Free' : formatPaise(shippingCost)}</span>
              </div>
              {appliedCoupon && (appliedCoupon.discountPaise > 0 || appliedCoupon.freeShipping) && (
                <div className="flex justify-between text-accent font-medium">
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>
                    {appliedCoupon.discountPaise > 0 && `-${formatPaise(appliedCoupon.discountPaise)}`}
                    {appliedCoupon.discountPaise > 0 && appliedCoupon.freeShipping && ' + '}
                    {appliedCoupon.freeShipping && 'free shipping'}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-ink/50 text-2xs">
                <span>Includes GST (18%)</span>
                <span>{formatPaise(Math.round((grandTotal * 18) / 118))}</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline py-4 border-t border-line">
              <span className="font-display text-base font-bold text-ink">Total</span>
              <span className="font-display text-2xl font-bold text-ink">{formatPaise(grandTotal)}</span>
            </div>

            {error && <p className="text-xs text-alert my-2">{error}</p>}
            {isFailed && (
              <div className="flex items-center justify-between gap-3 p-3 bg-alert/10 rounded-xl my-2">
                <p className="text-xs text-alert font-medium">Payment failed.</p>
                <button onClick={handleRetryAfterFailure} className="text-xs text-accent font-semibold underline">
                  Try again
                </button>
              </div>
            )}
            {orderId && !isFailed && (
              <p className="text-xs text-ink/70 my-2">Order {orderId} created — complete payment in the window that opened.</p>
            )}

            {!orderId && (
              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className="mt-2 w-full py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-center font-semibold text-sm transition-all shadow-sm disabled:opacity-40"
              >
                {placing ? 'Placing order…' : 'Place order'}
              </button>
            )}

            <p className="mt-4 text-center text-2xs text-ink/50 leading-relaxed">
              By placing an order, you agree to our terms and personalisation policy. We never store payment credentials.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
