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
import { splitGstFromInclusiveTotal, type Address } from '@bro-pics/shared';
import { MockPaymentDialog, type MockPaymentOutcome } from '../../components/checkout/MockPaymentDialog';
import { getPaymentModeClient } from '../../lib/payment-mode-client';
import { timeoutSignal } from '../../lib/timeout-signal';
import { fetchCheckoutQuote, type CheckoutQuote } from '../../lib/checkout-quote-client';
import { getGstSettingsClient, type GstDisplaySettings } from '../../lib/gst-settings-client';
import { loadRazorpayCheckoutScript } from '../../lib/razorpay-checkout-script';
import { DELIVERY_METHODS } from '../../lib/checkout-calc';
import { DEFAULT_STATE_SHIPPING, resolveShipping, shippingFailureMessage, type StateShippingSettings } from '@bro-pics/shared';
import { getShippingSettingsClient } from '../../lib/shipping-settings-client';
import { getOrCreateCheckoutIdempotencyKey, clearCheckoutIdempotencyKey } from '../../lib/checkout-idempotency-key';
import { TRANSIT_DAYS_MIN, TRANSIT_DAYS_MAX } from '../../components/product/DeliveryTimeline';
import type { DeliveryMethod } from '@bro-pics/shared';
import { useSiteText } from '../../components/layout/SiteTextContext';
import { useFestiveOffer } from '../../components/theme/FestiveOfferContext';

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
  const siteText = useSiteText();
  const { user } = useAuth();
  const { items, totalPaise, clearCart } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const selectedAddressPincode = selectedAddress?.pincode ?? null;
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const festiveOffer = useFestiveOffer();
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPaise: number; freeShipping: boolean } | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  // Starts at the same default constant used server-side, so there's
  // nothing to mismatch between server and client render — only upgraded
  // (in an effect, below) if settings/shipping actually overrides it.
  const [shippingSettings, setShippingSettings] = useState<StateShippingSettings>(DEFAULT_STATE_SHIPPING);
  // Display-only; the server recomputes tax. Absent/failed read => no GST line
  // rather than a made-up rate.
  const [gst, setGst] = useState<GstDisplaySettings>({ gstEnabled: false, taxRate: 0 });
  // Which gateway the server is configured with ('mock' = test mode, no real
  // charge). Only used to describe the payment step honestly.
  const [paymentProvider, setPaymentProvider] = useState<'mock' | 'razorpay' | null>(null);
  const [mockPayment, setMockPayment] = useState<{ orderId: string; orderNo?: string; amount: number } | null>(null);
  const [mockBusy, setMockBusy] = useState(false);
  // The server's own price summary. Until it arrives (or if it fails) the page
  // falls back to its local estimate below; create-order recomputes either way.
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);

  useEffect(() => {
    getShippingSettingsClient().then(setShippingSettings);
    getGstSettingsClient().then(setGst);
    getPaymentModeClient().then(setPaymentProvider);
  }, []);

  // Re-quote whenever anything that affects the price changes. Debounced a little
  // so flipping options quickly doesn't fire a request per click.
  const quoteKey = `${items.map((i) => `${i.variantId}:${i.personalizationId}:${i.qty}:${i.finish ?? ''}`).join(',')}|${appliedCoupon?.code ?? ''}|${deliveryMethod}|${addressId ?? ''}`;
  useEffect(() => {
    if (!user || items.length === 0 || orderId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchCheckoutQuote(user, { couponCode: appliedCoupon?.code ?? null, deliveryMethod, addressId }, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setQuote(result);
        // A coupon that has stopped applying must be dropped and explained, not kept on screen.
        if (result?.coupon.requested && !result.coupon.applied) {
          setAppliedCoupon(null);
          setCouponMessage(COUPON_REASON_MESSAGES[result.coupon.reason] ?? 'That coupon can no longer be applied.');
        }
      });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, user?.uid, orderId]);

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
        if (data.paymentStatus === 'paid') clearCheckoutIdempotencyKey();
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

  const handleApplyCoupon = async (offerCode?: string) => {
    const code = offerCode ?? couponCodeInput;
    if (offerCode) setCouponCodeInput(offerCode);
    setCouponMessage(null);
    const idToken = await user.getIdToken();
    const response = await fetch('/api/checkout/coupon/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ code }),
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
    setAppliedCoupon({ code, discountPaise: body.discountPaise, freeShipping: body.freeShipping });
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
    setMockPayment(null);
  };

  // Settles the mock payment through the server (same pipeline the Razorpay
  // webhook uses). The order listener above then reflects the result.
  const handleMockPaymentChoice = async (outcome: MockPaymentOutcome) => {
    if (!mockPayment) return;
    if (outcome === 'cancel') {
      setMockPayment(null);
      return;
    }
    setMockBusy(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/checkout/mock-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderId: mockPayment.orderId, outcome }),
      });
      if (!response.ok) {
        setError('Payment could not be completed. Please try again.');
        return;
      }
      const body = await response.json();
      setOrderStatus({ status: body.status, paymentStatus: body.paymentStatus, orderNo: body.orderNo ?? mockPayment.orderNo });
      if (outcome === 'success') {
        clearCart();
        clearCheckoutIdempotencyKey();
      }
      setMockPayment(null);
    } catch {
      setError('Payment could not be completed. Please check your connection and try again.');
    } finally {
      setMockBusy(false);
    }
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
        signal: timeoutSignal(30_000),
      });

      if (response.status === 409) {
        const body = await response.json().catch(() => null);
        if (body?.code === 'coupon_invalid') {
          // The coupon stopped applying between "Apply" and "Place order". Say so and
          // refresh the total, rather than letting the customer pay more than shown.
          setAppliedCoupon(null);
          setCouponMessage(COUPON_REASON_MESSAGES[body.reason] ?? 'That coupon can no longer be applied.');
          setError('Your coupon no longer applies, so your total has changed. Please review it and place the order again.');
          return;
        }
        setError(
          body?.code === 'already_paid'
            ? 'This order has already been paid for.'
            : 'Some items in your cart are no longer available. Please review your cart and try again.'
        );
        if (body?.code === 'already_paid') clearCheckoutIdempotencyKey();
        return;
      }
      if (response.status === 422) {
        const body = await response.json().catch(() => null);
        if (body?.code === 'shipping_unavailable') {
          setError(typeof body.error === 'string' ? body.error : 'We could not work out the shipping charge for this address.');
          return;
        }
      }
      if (response.status === 503) {
        setError('Payments are temporarily unavailable. Please try again in a little while.');
        return;
      }
      if (!response.ok) {
        setError('Could not place your order. Please try again.');
        return;
      }

      const { orderId: newOrderId, razorpayOrderId, amount, keyId, paymentProvider: provider, paymentStatus, orderNo: resOrderNo } = await response.json();
      setOrderId(newOrderId);
      // Paid status is only ever reported by the server's settlement
      // pipeline (via the order listener) — never inferred client-side.
      setOrderStatus({ status: undefined, paymentStatus, orderNo: resOrderNo });

      if (provider === 'mock') {
        setMockPayment({ orderId: newOrderId, orderNo: resOrderNo, amount });
        return;
      }

      if (provider !== 'razorpay' || !keyId) {
        setError('Payment could not be started. Please try again.');
        return;
      }

      await loadRazorpayCheckoutScript();
      const razorpay = new window.Razorpay({
        key: keyId,
        amount,
        currency: 'INR',
        order_id: razorpayOrderId,
        name: 'KarthysGallery',
        modal: {
          // Closing the window without paying leaves the order pending; the
          // "Resume payment" button re-opens the SAME order (same
          // idempotency key), so there is no duplicate and no dead end.
          ondismiss: () => setPlacing(false),
        },
        prefill: { contact: user.phoneNumber ?? undefined },
        theme: { color: '#c9861a' },
        // Razorpay hands back a signed result; the server checks the
        // signature AND reads the payment from Razorpay before settling the
        // order (the webhook is the backup if this request never arrives).
        handler: async (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setPaymentConfirming(true);
          try {
            const idToken = await user.getIdToken();
            const verify = await fetch('/api/checkout/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ orderId: newOrderId, ...result }),
            });
            const body = await verify.json().catch(() => ({}));
            if (verify.ok) {
              setOrderStatus({ status: body.status, paymentStatus: body.paymentStatus, orderNo: body.orderNo ?? resOrderNo });
              if (body.paymentStatus === 'paid') {
                clearCart();
                clearCheckoutIdempotencyKey();
              }
            } else if (verify.status !== 202) {
              setError('We could not confirm this payment yet. If money was taken, it will be confirmed shortly — please do not pay again.');
            }
          } catch {
            setError('We could not confirm this payment yet. If money was taken, it will be confirmed shortly — please do not pay again.');
          } finally {
            setPaymentConfirming(false);
          }
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

  // paymentStatus, not status: settlement moves the order past 'paid' (to
  // payment_confirmed / photo_validation / print_rendering) in one transaction,
  // so status === 'paid' is never observable.
  const isPaid = orderStatus?.paymentStatus === 'paid';
  const isFailed = orderStatus?.paymentStatus === 'failed';
  // Prefer the server's quote (live catalogue prices, real settings, real coupon
  // rules). The local figures are only an estimate shown until it arrives, or if
  // it can't be fetched — create-order recomputes everything either way.
  const hasQuote = quote !== null && quote.unavailable.length === 0;
  // The estimate shown until the server's quote arrives uses the SAME rule the server applies; the quote
  // (and create-order) are what is actually charged. An address that cannot be priced is shown as such, never as free.
  const localShippingResult = resolveShipping({ address: selectedAddress, deliveryMethod, settings: shippingSettings });
  const localShipping = localShippingResult.ok ? (appliedCoupon?.freeShipping ? 0 : localShippingResult.amount) : 0;
  const shippingBlock: string | null = hasQuote
    ? (quote.shippingMessage ?? null)
    : localShippingResult.ok
      ? null
      : shippingFailureMessage(localShippingResult.reason, localShippingResult.state);
  const displaySubtotal = hasQuote ? quote.subtotal : totalPaise;
  const displayShipping = hasQuote ? quote.shipping : localShipping;
  const displayDiscount = hasQuote ? quote.discount : (appliedCoupon?.discountPaise ?? 0);
  // Clamped for display only in the fallback path (calculateCouponDiscount already
  // caps a discount at the subtotal server-side).
  const grandTotal = hasQuote ? quote.total : Math.max(0, totalPaise - (appliedCoupon?.discountPaise ?? 0) + localShipping);
  const displayFreeShipping = hasQuote ? quote.coupon.requested && quote.coupon.applied && quote.coupon.freeShipping : Boolean(appliedCoupon?.freeShipping);
  const displayGst = hasQuote
    ? (quote.taxLines[0] ?? null)
    : gst.gstEnabled && gst.taxRate > 0
      ? { rate: gst.taxRate, amount: splitGstFromInclusiveTotal(grandTotal, gst.taxRate).gstAmountPaise }
      : null;
  const hasUnavailableItems = quote !== null && quote.unavailable.length > 0;
  const hasChangedFinish = quote !== null && quote.unavailable.some((u) => u.reason === 'finish_unavailable');
  const hasChangedCombo = quote !== null && quote.unavailable.some((u) => u.variantId.startsWith('combo:'));
  // A combo is priced as a whole, so its summary line shows the combo's price rather than a frame's.
  const quotedComboPrice = (item: { personalizationId: string; combo?: unknown }) =>
    item.combo ? quote?.combos?.find((c) => c.instanceId === item.personalizationId)?.price : undefined;
  const quotedUnitPrice = (item: { variantId: string; personalizationId: string }) =>
    quote?.lines.find((l) => l.variantId === item.variantId && l.personalizationId === item.personalizationId)?.unitPrice;

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Checkout</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">{siteText.checkoutHeadline}</h1>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Bag / Delivery / Payment</p>
      </div>

      {isPaid ? (
        <div className="rounded-3xl bg-field border border-line p-8 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
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
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
          {/* Left: Step Cards */}
          <div className="space-y-6">
            {/* Step 01: Contact — read-only; order updates go to the account's own
                email/mobile. Only what is actually on file is shown, and the whole
                card is hidden when nothing is (email is optional at sign-up). */}
            {(user.email || user.phoneNumber) && (
              <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
                <h2 className="font-display text-base font-bold text-ink mb-4">01 · Contact</h2>
                <dl className="grid sm:grid-cols-2 gap-4 mb-3 text-xs">
                  {user.phoneNumber && (
                    <div>
                      <dt className="text-2xs font-semibold text-ink/60 mb-1">Mobile</dt>
                      <dd className="text-ink font-medium">{user.phoneNumber}</dd>
                    </div>
                  )}
                  {user.email && (
                    <div>
                      <dt className="text-2xs font-semibold text-ink/60 mb-1">Email</dt>
                      <dd className="text-ink font-medium break-all">{user.email}</dd>
                    </div>
                  )}
                </dl>
                <p className="text-2xs text-ink/50">Order updates and delivery alerts only.</p>
              </div>
            )}

            {/* Step 02: Delivery Address */}
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">02 · Delivery address</h2>
              <AddressPicker
                userId={user.uid}
                onSelect={setAddressId}
                onSelectAddress={(address: Address) => setSelectedAddress(address)}
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
                  {DELIVERY_METHODS.filter((method) => method === 'standard' || shippingSettings.expressEnabled).map((method) => {
                    const methodResult = resolveShipping({ address: selectedAddress, deliveryMethod: method, settings: shippingSettings });
                    const cost: number | null = methodResult.ok ? methodResult.amount : null;
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
                        <span className="font-bold text-ink">{cost === null ? 'Choose an address' : cost === 0 ? 'Free' : formatPaise(cost)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 03: Payment */}
            <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">03 · Payment</h2>
              {paymentProvider === 'mock' ? (
                <p className="text-xs text-ink/70">
                  <span className="rounded-full bg-gold/30 text-ink px-2 py-0.5 text-2xs font-bold uppercase tracking-wider mr-2">Test mode</span>
                  Payments are simulated right now — placing an order will not charge you.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-4 py-2 rounded-full bg-ink text-paper text-xs font-medium">UPI / Cards / Net Banking</span>
                  </div>
                  <p className="text-xs text-ink/70">
                    You will be redirected to the secure Razorpay payment gateway to pay with UPI (GPay, PhonePe, Paytm), credit/debit card, or net banking.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Right: Order Summary Card */}
          <div className="rounded-3xl bg-paper border border-line p-6 lg:sticky lg:top-32 shadow-sm">
            <h2 className="font-display text-xl font-bold text-ink mb-4">{siteText.orderSummaryTitle}</h2>

            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={`${item.variantId}-${item.personalizationId}`} className="flex justify-between text-xs text-ink/80">
                  <span className="truncate pr-2">{item.title} × {item.qty}{item.finish === 'glitter' && ' · ✨ Glitter finish'}</span>
                  <span className="font-semibold text-ink">
                    {formatPaise(item.combo ? (quotedComboPrice(item) ?? item.unitPriceSnapshot) : (quotedUnitPrice(item) ?? item.unitPriceSnapshot) * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            {/* Coupon input */}
            <div className="my-4 pt-4 border-t border-line">
              <label htmlFor="coupon-code" className="block text-2xs text-ink/60 mb-1 font-semibold">{siteText.couponLabel}</label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-xs bg-tint/60 px-3 py-2 rounded-xl">
                  <span>
                    Coupon <strong>{appliedCoupon.code}</strong> applied
                  </span>
                  <button onClick={handleRemoveCoupon} className="text-2xs font-semibold text-accent hover:text-accent-dark underline">Remove</button>
                </div>
              ) : (
                <>
                {festiveOffer && (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/[0.05] px-3 py-2 text-xs text-ink" data-testid="festive-offer-apply">
                    <span>
                      {festiveOffer.percentOff}% off with <strong className="tracking-wide">{festiveOffer.code}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon(festiveOffer.code)}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-2xs font-semibold text-paper hover:bg-accent-dark"
                    >
                      Apply offer
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    id="coupon-code"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value)}
                    placeholder="Enter code"
                    className="flex-1 px-4 py-2 rounded-xl border border-line bg-field text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => handleApplyCoupon()}
                    disabled={!couponCodeInput}
                    className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-medium hover:bg-ink/80 disabled:opacity-40 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                </>
              )}
              {couponMessage && <p className="text-2xs text-alert mt-1.5">{couponMessage}</p>}
            </div>

            <div className="space-y-2 py-4 border-t border-line text-xs">
              <div className="flex justify-between text-ink/70">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{formatPaise(displaySubtotal)}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Shipping</span>
                <span className="font-medium text-ink">{shippingBlock ? '—' : displayShipping === 0 ? 'Free' : formatPaise(displayShipping)}</span>
              </div>
              {shippingBlock && (
                <p role="alert" data-testid="shipping-block" className="rounded-xl bg-alert/10 px-3 py-2 text-2xs text-alert">
                  {shippingBlock}
                </p>
              )}
              {appliedCoupon && (displayDiscount > 0 || displayFreeShipping) && (
                <div className="flex justify-between text-accent font-medium">
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>
                    {displayDiscount > 0 && `-${formatPaise(displayDiscount)}`}
                    {displayDiscount > 0 && displayFreeShipping && ' + '}
                    {displayFreeShipping && 'free shipping'}
                  </span>
                </div>
              )}
              {displayGst && (
                <div className="flex justify-between text-ink/50 text-2xs">
                  <span>Includes GST ({displayGst.rate}%)</span>
                  <span>{formatPaise(displayGst.amount)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-baseline py-4 border-t border-line">
              <span className="font-display text-base font-bold text-ink">Total</span>
              <span className="font-display text-2xl font-bold text-ink">{formatPaise(grandTotal)}</span>
            </div>

            {hasUnavailableItems && (
              <p role="alert" className="text-xs text-alert my-2">
                {hasChangedCombo
                  ? 'A combo in your bag has changed or is no longer available. Remove it from your bag and add it again.'
                  : hasChangedFinish
                    ? 'Glitter finish is no longer offered on a frame in your bag. Remove that frame and add it again with the matte finish.'
                    : 'Some items in your bag are no longer available. Please review your bag before checking out.'}
              </p>
            )}
            {paymentConfirming && (
              <p role="status" className="text-xs text-ink/70 my-2">Payment received — confirming it with Razorpay…</p>
            )}
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
              <p className="text-xs text-ink/70 my-2">
                Order {orderStatus?.orderNo ?? ''} is created and waiting for payment. If the payment window closed, use “Resume payment”.
              </p>
            )}

            {!isFailed && (
              <button
                onClick={handlePlaceOrder}
                disabled={placing || paymentConfirming || !addressId || hasUnavailableItems || shippingBlock !== null}
                className="mt-2 w-full min-h-[48px] py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-center font-semibold text-sm transition-all shadow-sm disabled:opacity-40"
              >
                {placing ? 'Please wait…' : orderId ? 'Resume payment' : siteText.placeOrderButton}
              </button>
            )}
            {!addressId && !orderId && (
              <p className="text-2xs text-ink/50 mt-2 text-center">{siteText.addressHint}</p>
            )}

            <p className="mt-4 text-center text-2xs text-ink/50 leading-relaxed">
              By placing an order, you agree to our terms and personalisation policy. We never store payment credentials.
            </p>
          </div>
        </div>
      )}
      {mockPayment && (
        <MockPaymentDialog
          amountPaise={mockPayment.amount}
          orderNo={mockPayment.orderNo}
          busy={mockBusy}
          onChoose={handleMockPaymentChoice}
        />
      )}
    </main>
  );
}
