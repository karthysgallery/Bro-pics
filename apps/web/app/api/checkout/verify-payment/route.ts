import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { settlePaymentCaptured } from '@bro-pics/shared/src/payments/firestore-payment-tx';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getPaymentProvider } from '../../../../lib/payments/provider-factory';
import { isValidCheckoutSignature } from '../../../../lib/payments/razorpay-signature';
import { captureRazorpayPayment, fetchRazorpayPayment } from '../../../../lib/razorpay-client';

/**
 * Confirms a Razorpay payment the moment the customer finishes Checkout,
 * instead of waiting for the webhook. Three independent checks before an
 * order is marked paid:
 *   1. the caller owns the order, and it is this order's Razorpay order;
 *   2. Razorpay's checkout signature is valid for (order_id, payment_id);
 *   3. the payment, read from Razorpay's own API, belongs to that order, is
 *      for the full amount in INR, and is captured (captured here if the
 *      account only authorizes).
 * Settlement goes through the same shared pipeline as the webhook
 * (settlePaymentCaptured), which ignores an order that is no longer
 * awaiting payment — so this route and the webhook can both fire safely.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'checkout');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  let provider;
  try {
    provider = getPaymentProvider();
  } catch {
    return NextResponse.json({ error: 'Payments are temporarily unavailable.' }, { status: 503 });
  }
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (provider.name !== 'razorpay' || !keySecret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const razorpayOrderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
  const razorpayPaymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
  const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !signature) {
    return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  const order = snap.exists
    ? (snap.data() as { userId: string; paymentProvider?: string; razorpayOrderId?: string; total: number; orderNo?: string })
    : null;
  if (!order || order.userId !== userId || order.paymentProvider !== 'razorpay' || order.razorpayOrderId !== razorpayOrderId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (!isValidCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature, keySecret })) {
    console.warn('[verify-payment] invalid signature', { orderId });
    return NextResponse.json({ error: 'Payment could not be verified', code: 'invalid_signature' }, { status: 400 });
  }

  let payment;
  try {
    payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (payment.order_id !== razorpayOrderId || payment.amount !== order.total || payment.currency !== 'INR') {
      console.error('[verify-payment] payment does not match order', { orderId, paymentOrder: payment.order_id, amount: payment.amount, total: order.total });
      return NextResponse.json({ error: 'Payment does not match this order', code: 'payment_mismatch' }, { status: 400 });
    }
    if (payment.status === 'authorized') {
      payment = await captureRazorpayPayment(razorpayPaymentId, order.total);
    }
  } catch (error) {
    // Razorpay unreachable: the webhook will still settle the order.
    console.error('[verify-payment] Razorpay lookup failed', { orderId, error: String(error) });
    return NextResponse.json({ error: 'Still confirming your payment', code: 'pending' }, { status: 202 });
  }
  if (payment.status !== 'captured') {
    return NextResponse.json({ error: 'Payment not completed', code: `payment_${payment.status}` }, { status: 409 });
  }

  await settlePaymentCaptured(db, {
    eventId: `checkout_${razorpayPaymentId}`,
    razorpayOrderId,
    razorpayPaymentId,
  });

  const after = (await orderRef.get()).data() as { status: string; paymentStatus: string; orderNo?: string };
  return NextResponse.json({ orderId, orderNo: after.orderNo ?? order.orderNo, status: after.status, paymentStatus: after.paymentStatus });
}
