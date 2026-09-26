import type { Firestore } from 'firebase-admin/firestore';
import { OrderEventSchema } from '../schemas/order-event';
import type { OrderEvent } from '../schemas/order-event';
import { isValidStatusTransition, allowedTransitionsFrom } from './status-transitions';
import type { OrderStatus, Order } from '../schemas/order';

export class OrderNotFoundError extends Error {}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    public readonly allowed: OrderStatus[]
  ) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}

/**
 * [ABE-16] Pure builder for the event every order transition writes —
 * shared by `transitionOrder` below AND `staff/orders/[orderNo]/advance`'s
 * own transaction, which can't fully delegate to `transitionOrder` (see
 * that route's own comment: it needs an extra read — the items
 * subcollection, for print_rendering's job-queuing — that must happen
 * BEFORE any write in the same Firestore transaction, and a black-box
 * transaction helper can't accommodate an extra read a caller needs
 * interleaved before its own writes without either breaking Firestore's
 * reads-before-writes rule or growing a callback API baroque enough to
 * not be worth it for a single caller). This builder is the one piece
 * that actually was safe and valuable to share.
 */
export function buildOrderTransitionEvent(
  eventId: string,
  toStatus: OrderStatus,
  actorUid: string,
  note: string | null,
  courier?: string | null,
  awbNumber?: string | null
): OrderEvent {
  return OrderEventSchema.parse({
    id: eventId,
    status: toStatus,
    note,
    courier: courier ?? null,
    awbNumber: awbNumber ?? null,
    createdAt: new Date().toISOString(),
    createdBy: actorUid,
  });
}

export interface TransitionOrderInput {
  orderId: string;
  toStatus: OrderStatus;
  actorUid: string;
  note?: string | null;
  /** Extra fields to merge onto the order doc alongside `status`. */
  extraOrderFields?: Record<string, unknown>;
}

export interface TransitionOrderResult {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
}

/**
 * [ABE-16] The single-order case: read the order, validate the
 * transition, write its event and status update, all in one transaction.
 * For callers with no extra reads to interleave (bulk transition, notes,
 * shipping tracking, resend, QC) — this is the "transitionOrder()" the
 * task asks to move onto. The staff-advance route's print_rendering path
 * stays on its own transaction for the reason `buildOrderTransitionEvent`'s
 * own doc comment explains.
 */
export async function transitionOrder(db: Firestore, input: TransitionOrderInput): Promise<TransitionOrderResult> {
  const orderRef = db.collection('orders').doc(input.orderId);
  let fromStatus!: OrderStatus;

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new OrderNotFoundError(`Unknown order id: ${input.orderId}`);
    }
    const order = orderSnap.data() as Order;
    fromStatus = order.status;
    if (!isValidStatusTransition(order.status, input.toStatus)) {
      throw new InvalidTransitionError(order.status, input.toStatus, allowedTransitionsFrom(order.status));
    }

    const eventRef = orderRef.collection('events').doc();
    const event = buildOrderTransitionEvent(
      eventRef.id,
      input.toStatus,
      input.actorUid,
      input.note ?? null,
      (input.extraOrderFields?.courier as string | undefined) ?? null,
      (input.extraOrderFields?.awbNumber as string | undefined) ?? null
    );
    transaction.set(eventRef, event);
    transaction.update(orderRef, { status: input.toStatus, ...(input.extraOrderFields ?? {}) });
  });

  return { orderId: input.orderId, fromStatus, toStatus: input.toStatus };
}
