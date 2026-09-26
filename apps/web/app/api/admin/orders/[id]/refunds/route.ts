import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { createRazorpayRefund } from '../../../../../../lib/razorpay-client';
import { getIdempotencyKeyHeader, findIdempotentResponse, recordIdempotentResponse } from '../../../../../../lib/admin-idempotency';
import { CreateRefundBodySchema } from './refund-request-schema';
import { RefundSchema, logger, type Order, type Refund } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-23] Admin ad-hoc refunds — full or partial, with or without an
 * originating return. Distinct from the existing return->refund flow
 * (staff/returns/[returnId]), which only ever refunds a return's full
 * `refundAmount` and only as the terminal step of that status machine.
 *
 * "Doc written first": the `orders/{id}/refunds/{refundId}` doc is
 * created with `status: 'pending'` BEFORE the Razorpay call — so a doc
 * exists even if the process crashes between the two, and the refund's
 * own doc id becomes Razorpay's idempotency key (stable, unique, minted
 * before the call that needs it). When `refundId` is given in the body,
 * this instead PROCESSES an existing pending doc — the path a refund
 * auto-proposed by a paid-order cancellation (see the cancel route) goes
 * through once staff confirm it, rather than creating a duplicate.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id: orderId } = await params;
  const db = getFirestore(getAdminApp());

  // [ABE-03 pattern] Sequential-retry protection, same as the staff
  // returns route — a timeout/double-click with the same Idempotency-Key
  // returns the original response instead of calling Razorpay again.
  const idempotencyKey = getIdempotencyKeyHeader(request);
  if (idempotencyKey) {
    const existing = await findIdempotentResponse(db, 'admin.orders.refunds', idempotencyKey);
    if (existing) {
      return NextResponse.json(existing.body, { status: existing.status });
    }
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateRefundBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid refund body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return adminApiError(404, 'not_found', `Unknown order id: ${orderId}`);
  }
  const order = orderSnap.data() as Order;
  if (!order.razorpayPaymentId) {
    return adminApiError(400, 'invalid_request', 'Order has no payment to refund');
  }

  const refundsCollection = orderRef.collection('refunds');
  let refundRef: FirebaseFirestore.DocumentReference;
  let refund: Refund;

  if (body.refundId) {
    refundRef = refundsCollection.doc(body.refundId);
    const existingSnap = await refundRef.get();
    if (!existingSnap.exists) {
      return adminApiError(404, 'not_found', `Unknown refundId: ${body.refundId}`);
    }
    const existingRefund = existingSnap.data() as Refund;
    if (existingRefund.status !== 'pending' || existingRefund.razorpayRefundId) {
      return adminApiError(409, 'conflict', `Refund ${body.refundId} is not a pending, unprocessed proposal`);
    }
    refund = existingRefund;
  } else {
    // Already-refunded total against this order — a plain equality query
    // over the subcollection, no composite index needed — bounds a new
    // ad-hoc refund to what's actually still refundable.
    const processedSnap = await refundsCollection.where('status', '==', 'processed').get();
    const alreadyRefunded = processedSnap.docs.reduce((sum, doc) => sum + (doc.data() as Refund).amount, 0);
    const remaining = order.total - alreadyRefunded;
    const amount = body.amount ?? remaining;
    if (amount <= 0 || amount > remaining) {
      return adminApiError(400, 'invalid_request', `amount must be between 1 and ${remaining} (already refunded: ${alreadyRefunded})`);
    }

    refundRef = refundsCollection.doc();
    refund = RefundSchema.parse({
      id: refundRef.id,
      orderId,
      amount,
      reason: body.reason ?? null,
      status: 'pending',
      razorpayRefundId: null,
      returnId: null,
      createdAt: new Date(),
      createdBy: permission.uid,
      processedAt: null,
      failureReason: null,
    });
    await refundRef.set(refund);
  }

  // Real money movement — outside any transaction, same rule as the
  // staff returns route and create-order's Razorpay-order-creation step.
  // The refund doc's own id is Razorpay's idempotency key: stable, unique
  // per refund attempt, and minted before this call needs it.
  let responseBody: Record<string, unknown>;
  let responseStatus: number;
  try {
    const result = await createRazorpayRefund({
      paymentId: order.razorpayPaymentId,
      amount: refund.amount,
      notes: { orderId, refundId: refundRef.id },
      idempotencyKey: refundRef.id,
    });
    const nextStatus = result.status === 'processed' ? 'processed' : 'pending';
    await refundRef.update({
      status: nextStatus,
      razorpayRefundId: result.id,
      ...(nextStatus === 'processed' && { processedAt: new Date() }),
    });

    // A fully-refunded order (this refund plus any prior processed ones
    // reaches the order total) moves to 'refunded', same convention the
    // return flow already uses for its own full-refund case.
    if (nextStatus === 'processed') {
      const processedSnap = await refundsCollection.where('status', '==', 'processed').get();
      const totalProcessed = processedSnap.docs.reduce((sum, doc) => sum + (doc.data() as Refund).amount, 0);
      if (totalProcessed >= order.total && order.status !== 'refunded') {
        await orderRef.update({ status: 'refunded' });
      }
    }

    responseBody = { refundId: refundRef.id, status: nextStatus, razorpayRefundId: result.id };
    responseStatus = 200;

    await writeAuditLog(db, {
      actorUid: permission.uid,
      action: 'refund.process',
      resource: 'refund',
      resourceId: refundRef.id,
      details: { orderId, amount: refund.amount, status: nextStatus },
    }).catch((error) => logger.error('Failed to write audit log', { refundId: refundRef.id, error: String(error) }));
  } catch (error) {
    await refundRef.update({ status: 'failed', failureReason: String(error) }).catch((updateError) =>
      logger.error('Failed to mark refund as failed after a Razorpay error', { refundId: refundRef.id, error: String(updateError) })
    );

    await writeAuditLog(db, {
      actorUid: permission.uid,
      action: 'refund.failed',
      resource: 'refund',
      resourceId: refundRef.id,
      details: { orderId, amount: refund.amount, error: String(error) },
    }).catch((auditError) => logger.error('Failed to write audit log', { refundId: refundRef.id, error: String(auditError) }));

    responseBody = { refundId: refundRef.id, status: 'failed', error: 'Razorpay refund failed' };
    responseStatus = 502;
  }

  if (idempotencyKey) {
    await recordIdempotentResponse(db, 'admin.orders.refunds', idempotencyKey, responseStatus, responseBody).catch((error) =>
      logger.error('Failed to record idempotent response', { orderId, error: String(error) })
    );
  }

  return NextResponse.json(responseBody, { status: responseStatus });
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }

  const { id: orderId } = await params;
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('orders').doc(orderId).collection('refunds').get();
  const refunds = snapshot.docs.map((doc) => doc.data());

  return NextResponse.json({ refunds }, { status: 200 });
}
