import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { writeNotification } from '../../../../../lib/notify';
import { OrderEventSchema, RefundSchema, logger, type OrderStatus } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// Matches the order lifecycle's "before production starts" rule — once an
// order is printed/packed, cancelling it no longer prevents any real-world
// cost, so it's not offered past this point.
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'in_production'];

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

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(orderId);

  let orderNo = '';
  try {
    const updatedStatus = await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new NotFoundError();
      }
      const order = orderSnap.data() as { userId: string; status: OrderStatus; orderNo: string; paymentStatus: string; total: number };
      if (order.userId !== userId) {
        throw new NotFoundError();
      }
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw new NotCancellableError(order.status);
      }
      orderNo = order.orderNo;

      const eventRef = orderRef.collection('events').doc();
      const event = OrderEventSchema.parse({
        id: eventRef.id,
        status: 'cancelled',
        note: 'Cancelled by customer',
        courier: null,
        awbNumber: null,
        createdAt: new Date().toISOString(),
        createdBy: userId,
      });
      transaction.set(eventRef, event);
      transaction.update(orderRef, { status: 'cancelled' });

      // [ABE-23] "A paid-order cancellation should propose a refund
      // automatically" — a PROPOSAL, not an actual charge: this never
      // calls Razorpay (an external HTTP call has no place inside a
      // Firestore transaction anyway, same rule every money-moving route
      // in this codebase already follows). The doc sits at `pending` with
      // no `razorpayRefundId` until staff process it via
      // POST /api/admin/orders/{id}/refunds with this doc's id — the
      // same "doc written first, Razorpay called after" shape that route
      // uses for a fresh ad-hoc refund, just with the doc pre-created by
      // this cancellation instead of by that route itself.
      if (order.paymentStatus === 'paid') {
        const refundRef = orderRef.collection('refunds').doc();
        const refund = RefundSchema.parse({
          id: refundRef.id,
          orderId,
          amount: order.total,
          reason: 'Order cancelled by customer',
          status: 'pending',
          razorpayRefundId: null,
          returnId: null,
          createdAt: new Date(),
          createdBy: null,
          processedAt: null,
          failureReason: null,
        });
        transaction.set(refundRef, refund);
      }

      return 'cancelled' as const;
    });

    // Best-effort, same as the staff-advance route — a notification is a
    // side effect of the cancellation, not part of its correctness.
    writeNotification(db, userId, 'order', 'Order cancelled', `Order ${orderNo} has been cancelled.`, `/orders/${orderId}`).catch(
      (error) => logger.error('Failed to write notification', { orderId, uid: userId, error: String(error) })
    );

    return NextResponse.json({ status: updatedStatus }, { status: 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
    }
    if (error instanceof NotCancellableError) {
      return NextResponse.json({ error: `Cannot cancel an order in status ${error.status}` }, { status: 400 });
    }
    throw error;
  }
}

class NotFoundError extends Error {}
class NotCancellableError extends Error {
  constructor(public status: OrderStatus) {
    super();
  }
}
