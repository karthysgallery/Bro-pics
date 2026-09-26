import { NotificationOutboxSchema, type NotificationOutboxEntry, type NotificationOutboxChannel } from '../schemas/notification-outbox';
import type { NotificationCategory } from '../schemas/notification';

/**
 * [BE-27] Deterministic id so re-queuing the same transition twice (e.g. a
 * redelivered webhook event) is a no-op, not a duplicate — same reasoning
 * as buildQueuedPrintJob's {orderId}_{itemId}. A notification fires per
 * *transition*, not per entity, so the key includes the transition's own
 * identifier ({orderId}_{status} for an order, {return_returnId}_{status}
 * for a return) rather than just the parent id, which would collide
 * across every status change on the same order/return.
 */
export function notificationOutboxId(scope: 'order' | 'return', entityId: string, status: string): string {
  return scope === 'order' ? `${entityId}_${status}` : `return_${entityId}_${status}`;
}

export interface QueueNotificationInput {
  id: string;
  userId: string;
  channel: NotificationOutboxChannel;
  category: NotificationCategory;
  title: string;
  body: string;
  linkHref?: string | null;
}

/** Builds a fresh queued outbox entry — no Firestore access, so a caller
 * already inside its own transaction can transaction.set() this directly
 * instead of nesting a second one (same reasoning as
 * print-jobs.ts's buildQueuedPrintJob). */
export function buildQueuedNotification(input: QueueNotificationInput): NotificationOutboxEntry {
  const now = new Date();
  return NotificationOutboxSchema.parse({
    id: input.id,
    userId: input.userId,
    channel: input.channel,
    category: input.category,
    title: input.title,
    body: input.body,
    linkHref: input.linkHref ?? null,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
}
