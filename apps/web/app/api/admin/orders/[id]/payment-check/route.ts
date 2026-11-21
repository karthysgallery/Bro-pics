import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { fetchRazorpayOrderPayments } from '../../../../../../lib/razorpay-client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/orders/{id}/payment-check — what Razorpay itself has for this order: every payment attempt with
 * its status, method, time and Razorpay's own failure reason. Read-only: it never changes the order. (An order is
 * marked paid only by the existing verified paths: the checkout confirmation and the Razorpay webhook.)
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('orders').doc(id).get();
  if (!snap.exists) return adminApiError(404, 'not_found', 'Order not found');
  const order = snap.data() as { paymentProvider?: string; razorpayOrderId?: string; total?: number; paymentStatus?: string };

  if (order.paymentProvider === 'mock') {
    return NextResponse.json({ source: 'test', message: 'This order used the test payment system. No money moved, so Razorpay has nothing for it.', attempts: [] });
  }
  if (!order.razorpayOrderId) {
    return NextResponse.json({ source: 'none', message: 'No Razorpay payment was ever started for this order.', attempts: [] });
  }

  try {
    const payments = await fetchRazorpayOrderPayments(order.razorpayOrderId);
    const attempts = payments
      .map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount,
        method: p.method,
        at: new Date(p.created_at * 1000).toISOString(),
        reason: p.error_description,
        code: p.error_code,
        matchesOrder: p.amount === order.total && p.currency === 'INR',
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    const captured = attempts.find((a) => a.status === 'captured' && a.matchesOrder);
    let message: string;
    if (attempts.length === 0) message = 'The customer opened Razorpay but no payment was attempted.';
    else if (captured && order.paymentStatus !== 'paid')
      message = 'Razorpay shows this order as paid, but the shop has not recorded it yet. It is normally updated within minutes by Razorpay\'s notification; if it stays like this, contact support before doing anything.';
    else if (captured) message = 'Razorpay confirms the payment.';
    else if (attempts.every((a) => a.status === 'failed')) message = `${attempts.length} payment attempt${attempts.length === 1 ? '' : 's'} failed. Razorpay's reason is shown for each.`;
    else message = 'A payment is in progress or waiting to be completed at Razorpay.';
    return NextResponse.json({ source: 'razorpay', razorpayOrderId: order.razorpayOrderId, message, attempts });
  } catch {
    return adminApiError(502, 'internal', 'Razorpay could not be reached. Try again in a minute.');
  }
}
