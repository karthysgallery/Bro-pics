import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { settlePaymentCaptured, settlePaymentFailed } from '@bro-pics/shared/src/payments/firestore-payment-tx';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getPaymentProvider } from '../../../../lib/payments/provider-factory';
import { MOCK_PAYMENT_ORDER_PREFIX } from '../../../../lib/payments/mock-provider';

type MockOutcome = 'success' | 'failure' | 'cancel';
const OUTCOMES: readonly MockOutcome[] = ['success', 'failure', 'cancel'];

/**
 * The mock payment provider's stand-in for "the gateway tells us how the
 * payment went". For Razorpay that message is a signed webhook; here it's
 * the customer pressing a button in the mock payment dialog. Either way the
 * order settles through the SAME shared pipeline (settlePaymentCaptured /
 * settlePaymentFailed), so a mock-paid order gets an invoice number, print
 * jobs, notifications, coupon accounting, etc. exactly like a real one.
 *
 * Hard guards — this route must never be a way to mark real orders paid:
 *  - only active when the server's configured provider is 'mock'
 *  - only for the caller's own order
 *  - only for orders that were created by the mock provider
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
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (provider.name !== 'mock') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  let body: { orderId?: unknown; outcome?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const outcome = OUTCOMES.find((o) => o === body.outcome);
  if (!orderId || !outcome) {
    return NextResponse.json({ error: 'orderId and a valid outcome are required' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  const order = snap.exists
    ? (snap.data() as {
        userId: string;
        paymentProvider?: string;
        razorpayOrderId?: string;
        orderNo?: string;
      })
    : null;

  // 404 (not 403) for someone else's order so ids can't be probed.
  if (!order || order.userId !== userId || order.paymentProvider !== 'mock' || !order.razorpayOrderId?.startsWith(MOCK_PAYMENT_ORDER_PREFIX)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (outcome === 'success') {
    await settlePaymentCaptured(db, {
      eventId: `mock_evt_${orderId}`,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: `pay_mock_${orderId}`,
    });
  } else if (outcome === 'failure') {
    await settlePaymentFailed(db, { razorpayOrderId: order.razorpayOrderId });
  }
  // 'cancel': the customer closed the dialog — nothing settles; the order
  // stays pending_payment and the same order can be paid on retry.

  const after = (await orderRef.get()).data() as { status: string; paymentStatus: string; orderNo?: string };
  return NextResponse.json({ orderId, orderNo: after.orderNo ?? order.orderNo, status: after.status, paymentStatus: after.paymentStatus });
}
