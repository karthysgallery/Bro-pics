import { FieldValue, type Firestore } from 'firebase-admin/firestore';
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
  // [BE-27] Denormalized so GET /api/notifications doesn't have to derive
  // unreadCount from its own capped-50 slice — which undercounts once a
  // user has more than 50 notifications, a real (if minor) bug this
  // closes. Lives at users/{uid}/private/notificationStats, NOT on the
  // users/{uid} doc itself — that doc is client-writable
  // (firestore.rules: allow write: if isOwner(userId)), so a denormalized
  // counter there could be silently clobbered by an unrelated client
  // write; this subcollection has no client access at all (see
  // firestore.rules' explicit deny, matching the printJobs/webhookEvents
  // pattern).
  await db
    .collection('users')
    .doc(userId)
    .collection('private')
    .doc('notificationStats')
    .set({ unreadCount: FieldValue.increment(1) }, { merge: true });
}
