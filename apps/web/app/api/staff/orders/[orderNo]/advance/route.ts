import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { findOrderByOrderNo } from '../../../../../../lib/order-lookup';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { writeNotification } from '../../../../../../lib/notify';
import {
  OrderEventSchema,
  isValidStatusTransition,
  buildQueuedPrintJob,
  ManualShippingProvider,
  type OrderStatus,
  type NotificationCategory,
  type ShipmentTracking,
} from '@bro-pics/shared';

// [BE-20] No real courier API integration exists yet — see
// ManualShippingProvider's own doc comment. Module-scoped since it's
// stateless; swapping in a real provider later is a one-line change here.
const shippingProvider = new ManualShippingProvider();

interface RouteParams {
  params: Promise<{ orderNo: string }>;
}

const NOTIFICATION_BY_STATUS: Partial<Record<OrderStatus, { category: NotificationCategory; title: string; body: string }>> = {
  paid: { category: 'payment', title: 'Payment confirmed', body: 'has been confirmed.' },
  in_production: { category: 'order', title: 'Order in production', body: 'is now being printed.' },
  printed_packed: { category: 'order', title: 'Order packed', body: 'has been printed and packed.' },
  shipped: { category: 'shipping', title: 'Order shipped', body: 'has shipped.' },
  delivered: { category: 'delivery', title: 'Order delivered', body: 'has been delivered.' },
  cancelled: { category: 'order', title: 'Order cancelled', body: 'has been cancelled.' },
  refunded: { category: 'refund', title: 'Order refunded', body: 'has been refunded.' },
  replacement_issued: { category: 'order', title: 'Replacement issued', body: 'has a replacement on the way.' },
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { orderNo } = await params;
  const db = getFirestore(getAdminApp());
  const found = await findOrderByOrderNo(db, orderNo);
  if (!found) {
    return NextResponse.json({ error: `Unknown orderNo: ${orderNo}` }, { status: 404 });
  }

  const body = await request.json();
  const status = body?.status as OrderStatus | undefined;
  const note = typeof body?.note === 'string' ? body.note : null;
  const courier = typeof body?.courier === 'string' ? body.courier : undefined;
  const awbNumber = typeof body?.awbNumber === 'string' ? body.awbNumber : undefined;

  if (!status) {
    return NextResponse.json({ error: 'Missing status' }, { status: 400 });
  }
  if (status === 'shipped' && (!courier || !awbNumber)) {
    return NextResponse.json({ error: 'courier and awbNumber are required when advancing to shipped' }, { status: 400 });
  }
  if (!isValidStatusTransition(found.data.status, status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${found.data.status} to ${status}` },
      { status: 400 }
    );
  }

  const orderRef = db.collection('orders').doc(found.id);
  const eventRef = orderRef.collection('events').doc();

  const orderUpdate: Record<string, unknown> = { status };
  if (status === 'shipped') {
    orderUpdate.courier = courier;
    orderUpdate.awbNumber = awbNumber;
    const shippedAt = new Date().toISOString();
    const shipmentTracking: ShipmentTracking = {
      provider: courier!,
      awbNumber: awbNumber!,
      trackingUrl: shippingProvider.trackingUrlFor(courier!, awbNumber!),
      status: 'shipped',
      shippedAt,
      deliveredAt: null,
    };
    orderUpdate.shipmentTracking = shipmentTracking;
  }

  try {
    await db.runTransaction(async (transaction) => {
      // The authoritative read: this is what Firestore actually uses for
      // optimistic-concurrency conflict detection, so the transition check
      // MUST be based on this in-transaction read, not the earlier read
      // done outside the transaction (that one is stale the moment a
      // concurrent request commits). Reads must finish before any writes
      // in a Firestore transaction, so this stays the first statement.
      const orderSnap = await transaction.get(orderRef);
      const currentStatus = orderSnap.data()?.status as OrderStatus | undefined;
      if (!currentStatus || !isValidStatusTransition(currentStatus, status)) {
        throw new StatusConflictError(
          `Cannot transition from ${currentStatus ?? 'unknown'} to ${status}`
        );
      }

      // [BE-20] 'delivered' updates the SAME shipmentTracking object
      // 'shipped' created, rather than replacing it — provider/awbNumber/
      // trackingUrl/shippedAt all carry forward, only status and
      // deliveredAt change. If an order somehow reaches 'delivered' with
      // no prior shipmentTracking (e.g. one shipped before this field
      // existed), there's nothing to merge into — leave it absent rather
      // than fabricate placeholder provider/awbNumber values.
      if (status === 'delivered') {
        const existing = orderSnap.data()?.shipmentTracking as ShipmentTracking | undefined;
        if (existing) {
          const shipmentTracking: ShipmentTracking = {
            ...existing,
            status: 'delivered',
            deliveredAt: new Date().toISOString(),
          };
          orderUpdate.shipmentTracking = shipmentTracking;
        }
      }

      // [BE-18] A red-tier order holds at photo_validation until staff
      // manually advances it — this is that path's equivalent of the
      // webhook's own auto-pass: reaching print_rendering always means
      // "queue a print job per item," whichever caller got it there. The
      // items read must happen here, before any write below (Firestore's
      // reads-before-writes rule), even though it's only used when
      // status === 'print_rendering'.
      const itemsSnap =
        status === 'print_rendering' ? await transaction.get(orderRef.collection('items')) : null;

      const event = OrderEventSchema.parse({
        id: eventRef.id,
        status,
        note,
        courier: status === 'shipped' ? courier : null,
        awbNumber: status === 'shipped' ? awbNumber : null,
        createdAt: new Date().toISOString(),
        createdBy: staffUserId,
      });
      transaction.set(eventRef, event);
      transaction.update(orderRef, orderUpdate);

      if (itemsSnap) {
        for (const itemDoc of itemsSnap.docs) {
          const personalizationId = (itemDoc.data() as { personalizationId: string }).personalizationId;
          const job = buildQueuedPrintJob(found.id, itemDoc.id, personalizationId);
          transaction.set(db.collection('printJobs').doc(job.id), job);
        }
      }
    });
  } catch (error) {
    if (error instanceof StatusConflictError) {
      return NextResponse.json({ error: 'order status changed, please retry' }, { status: 409 });
    }
    throw error;
  }

  // Best-effort, outside the transaction — a notification is a side effect
  // of the status change, not part of its correctness; a failure here
  // shouldn't turn an otherwise-successful advance into an error response.
  const notification = NOTIFICATION_BY_STATUS[status];
  if (notification) {
    writeNotification(
      db,
      found.data.userId,
      notification.category,
      notification.title,
      `Order ${found.data.orderNo} ${notification.body}`,
      `/orders/${found.id}`
    ).catch((error) => console.error('Failed to write notification:', error));
  }

  return NextResponse.json({ order: { ...found.data, ...orderUpdate } }, { status: 200 });
}

class StatusConflictError extends Error {}
