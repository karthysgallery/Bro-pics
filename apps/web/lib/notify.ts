import type { Firestore } from 'firebase-admin/firestore';
import { NotificationSchema, type NotificationCategory } from '@bro-pics/shared';

/**
 * Stored at users/{uid}/notifications/{id} — a natural owner-scoped
 * subcollection, though (like every other new collection this round) it's
 * unreachable by direct client reads: no firestore.rules block matches it,
 * so deny-by-default applies. Read only through /api/notifications.
 *
 * This is the one write-side primitive every status-changing route calls
 * into, so the notification system is genuinely event-driven rather than a
 * bolt-on the customer has to separately trust is in sync. See callers in
 * the staff order-advance, order-cancel, and staff-returns-advance routes.
 *
 * NOT called from the Razorpay payment webhook (functions/src/webhooks/
 * razorpay.ts) — that file is outside this round's frontend-only boundary.
 * "Order placed"/"Payment successful"/"Payment failed" notifications are a
 * documented gap for that reason, not an oversight — see this round's
 * backend notes doc for the exact line that webhook would need.
 */
export async function writeNotification(
  db: Firestore,
  userId: string,
  category: NotificationCategory,
  title: string,
  body: string,
  linkHref: string | null = null
): Promise<void> {
  const ref = db.collection('users').doc(userId).collection('notifications').doc();
  const notification = NotificationSchema.parse({
    id: ref.id,
    userId,
    category,
    title,
    body,
    linkHref,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
  await ref.set(notification);
}
