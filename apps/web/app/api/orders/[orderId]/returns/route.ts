import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { ReturnSchema, type Order, type OrderEvent } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// A return can only be requested within this many days of delivery —
// matches the order lifecycle's own "before production starts" cancellation
// window in spirit (a real business rule, not enforced by anything else
// today). Sourced from the delivered order_event's createdAt, not
// order.placedAt, since what matters is how long the customer has actually
// had the item.
const RETURN_WINDOW_DAYS = 7;

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists || (orderSnap.data() as Order).userId !== userId) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }

  const snapshot = await db.collection('returns').where('orderId', '==', orderId).get();
  return NextResponse.json({ returns: snapshot.docs.map((d) => d.data()) }, { status: 200 });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'Missing reason' }, { status: 400 });
  }

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }
  const order = orderSnap.data() as Order;
  if (order.userId !== userId) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }
  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Only a delivered order can be returned' }, { status: 400 });
  }

  const existingReturns = await db.collection('returns').where('orderId', '==', orderId).get();
  if (!existingReturns.empty) {
    return NextResponse.json({ error: 'A return has already been requested for this order' }, { status: 409 });
  }

  const deliveredEventSnap = await orderRef.collection('events').where('status', '==', 'delivered').limit(1).get();
  if (deliveredEventSnap.empty) {
    // Order status says delivered but no event recorded it — a data
    // inconsistency this route shouldn't paper over by guessing a window.
    return NextResponse.json({ error: 'Could not verify delivery date' }, { status: 400 });
  }
  const deliveredEvent = deliveredEventSnap.docs[0].data() as OrderEvent;
  const deliveredAt = new Date(deliveredEvent.createdAt);
  const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (new Date() > windowEnd) {
    return NextResponse.json({ error: `The ${RETURN_WINDOW_DAYS}-day return window has passed` }, { status: 400 });
  }

  const returnRef = db.collection('returns').doc();
  const returnDoc = ReturnSchema.parse({
    id: returnRef.id,
    orderId,
    userId,
    reason,
    status: 'requested',
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    refundAmount: order.total,
  });
  await returnRef.set(returnDoc);

  return NextResponse.json({ return: returnDoc }, { status: 200 });
}
