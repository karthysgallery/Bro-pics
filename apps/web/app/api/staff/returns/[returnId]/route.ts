import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { createRazorpayRefund } from '../../../../../lib/razorpay-client';
import { writeNotification } from '../../../../../lib/notify';
import { getIdempotencyKeyHeader, findIdempotentResponse, recordIdempotentResponse } from '../../../../../lib/admin-idempotency';
import { writeAuditLog } from '../../../../../lib/audit-log';
import {
  ReturnStatusSchema,
  isValidReturnStatusTransition,
  OrderEventSchema,
  ReturnEventSchema,
  logger,
  type Return,
  type ReturnStatus,
  type Order,
} from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ returnId: string }>;
}

const TERMINAL_STATUSES: ReturnStatus[] = ['rejected', 'refunded'];

const NOTIFICATION_BY_RETURN_STATUS: Partial<Record<ReturnStatus, { title: string; body: string }>> = {
  approved: { title: 'Return approved', body: 'has been approved.' },
  rejected: { title: 'Return rejected', body: 'was not approved.' },
  pickup_scheduled: { title: 'Pickup scheduled', body: 'has a pickup scheduled.' },
  picked_up: { title: 'Item picked up', body: 'has been picked up.' },
  refund_processing: { title: 'Refund processing', body: 'is being processed.' },
  refunded: { title: 'Refund complete', body: 'has been refunded.' },
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'returns:write');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Staff access required' }, { status: permission.status });
  }
  const staffUserId = permission.uid;
  const db = getFirestore(getAdminApp());

  // [ABE-03] Closes the race this route's own comment below has long
  // documented: a retried advance to 'refunded' (timeout, double-click)
  // with the same Idempotency-Key returns the ORIGINAL response instead
  // of calling Razorpay's refund API a second time.
  const idempotencyKey = getIdempotencyKeyHeader(request);
  if (idempotencyKey) {
    const existing = await findIdempotentResponse(db, 'staff.returns.advance', idempotencyKey);
    if (existing) {
      return NextResponse.json(existing.body, { status: existing.status });
    }
  }

  const body = await request.json();
  const statusParsed = ReturnStatusSchema.safeParse(body?.status);
  if (!statusParsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }
  const nextStatus = statusParsed.data;
  const staffNote = typeof body?.staffNote === 'string' ? body.staffNote : null;

  const { returnId } = await params;
  const returnRef = db.collection('returns').doc(returnId);
  const returnSnap = await returnRef.get();
  if (!returnSnap.exists) {
    return NextResponse.json({ error: `Unknown returnId: ${returnId}` }, { status: 404 });
  }
  const currentReturn = returnSnap.data() as Return;
  if (!isValidReturnStatusTransition(currentReturn.status, nextStatus)) {
    return NextResponse.json({ error: `Cannot transition from ${currentReturn.status} to ${nextStatus}` }, { status: 400 });
  }

  const orderRef = db.collection('orders').doc(currentReturn.orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: 'Order for this return no longer exists' }, { status: 400 });
  }
  const order = orderSnap.data() as Order;

  // Real money movement, so it happens BEFORE any Firestore write and
  // outside the transaction below (an external HTTP call must never sit
  // inside a Firestore transaction, which can retry on contention — see
  // create-order's own Razorpay-order-creation step for the same rule).
  // [ABE-03] A SEQUENTIAL retry (timeout, double-click) with the same
  // Idempotency-Key is now caught above, before this call. What remains,
  // documented as a known gap in razorpay-client.ts: two genuinely
  // CONCURRENT requests racing between this check and the transaction's
  // own re-check below could still both call Razorpay — accepted for a
  // low-concurrency, staff-only action; closing it needs a lock/lease
  // around the whole handler, not just idempotency-key caching.
  let razorpayRefundId: string | undefined;
  if (nextStatus === 'refunded') {
    if (!order.razorpayPaymentId) {
      return NextResponse.json({ error: 'Order has no payment to refund' }, { status: 400 });
    }
    const refund = await createRazorpayRefund({
      paymentId: order.razorpayPaymentId,
      amount: currentReturn.refundAmount,
      notes: { returnId },
    });
    razorpayRefundId = refund.id;
  }

  try {
    await db.runTransaction(async (transaction) => {
      const freshReturnSnap = await transaction.get(returnRef);
      const freshStatus = (freshReturnSnap.data() as Return | undefined)?.status;
      if (!freshStatus || !isValidReturnStatusTransition(freshStatus, nextStatus)) {
        throw new StatusConflictError();
      }

      const returnUpdate: Record<string, unknown> = { status: nextStatus, staffNote };
      if (TERMINAL_STATUSES.includes(nextStatus)) {
        returnUpdate.resolvedAt = new Date().toISOString();
      }
      if (razorpayRefundId) {
        returnUpdate.razorpayRefundId = razorpayRefundId;
      }
      transaction.update(returnRef, returnUpdate);

      // [BE-19] History entry for every staff status change, not just the
      // terminal refunded one — mirrors orders/{id}/events (see
      // OrderEventSchema's use in the staff-advance route).
      const returnEventRef = returnRef.collection('events').doc();
      const returnEvent = ReturnEventSchema.parse({
        id: returnEventRef.id,
        status: nextStatus,
        staffNote,
        createdAt: new Date().toISOString(),
        createdBy: staffUserId,
      });
      transaction.set(returnEventRef, returnEvent);

      // Once a return actually completes, the parent order moves to
      // 'refunded' too — 'delivered' -> 'refunded' is already a legal
      // OrderStatus transition (status-transitions.ts), reusing the same
      // event-log pattern every other order status change goes through.
      if (nextStatus === 'refunded') {
        const eventRef = orderRef.collection('events').doc();
        const event = OrderEventSchema.parse({
          id: eventRef.id,
          status: 'refunded',
          note: `Return ${returnId} refunded`,
          courier: null,
          awbNumber: null,
          createdAt: new Date().toISOString(),
          createdBy: staffUserId,
        });
        transaction.set(eventRef, event);
        transaction.update(orderRef, { status: 'refunded' });
      }
    });
  } catch (error) {
    if (error instanceof StatusConflictError) {
      return NextResponse.json({ error: 'Return status changed, please retry' }, { status: 409 });
    }
    throw error;
  }

  // Best-effort, outside the transaction — same fire-and-forget pattern as
  // the staff order-advance and customer cancel routes.
  const notification = NOTIFICATION_BY_RETURN_STATUS[nextStatus];
  if (notification) {
    writeNotification(
      db,
      currentReturn.userId,
      'refund',
      notification.title,
      `Return for order ${order.orderNo} ${notification.body}`,
      `/orders/${currentReturn.orderId}`
    ).catch((error) =>
      logger.error('Failed to write notification', { orderId: currentReturn.orderId, uid: currentReturn.userId, returnId, error: String(error) })
    );
  }

  const responseBody = { status: nextStatus, razorpayRefundId };

  await writeAuditLog(db, {
    actorUid: staffUserId,
    action: 'return.advance',
    resource: 'return',
    resourceId: returnId,
    details: { fromStatus: currentReturn.status, toStatus: nextStatus, razorpayRefundId },
  }).catch((error) => logger.error('Failed to write audit log', { returnId, error: String(error) }));

  if (idempotencyKey) {
    await recordIdempotentResponse(db, 'staff.returns.advance', idempotencyKey, 200, responseBody).catch((error) =>
      logger.error('Failed to record idempotent response', { returnId, error: String(error) })
    );
  }

  return NextResponse.json(responseBody, { status: 200 });
}

class StatusConflictError extends Error {}
