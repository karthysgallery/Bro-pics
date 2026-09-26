import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { checkRateLimit } from '../../../lib/rate-limit';
import type { Notification } from '@bro-pics/shared';

// A plain read of the whole (small, per-user) subcollection, sorted in
// memory — same tradeoff as /api/reviews/mine: a userId+createdAt composite
// index isn't needed this way, at the cost of not scaling to a customer
// with thousands of notifications. Capped at the 50 most recent rather than
// real cursor-based pagination, which is enough for an account-page
// notification center at this app's scale.
const MAX_NOTIFICATIONS = 50;

function toMillis(value: unknown): number {
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

export async function GET(request: Request): Promise<NextResponse> {
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

  const db = getFirestore(getAdminApp());
  const [snapshot, statsSnap] = await Promise.all([
    db.collection('users').doc(userId).collection('notifications').get(),
    db.collection('users').doc(userId).collection('private').doc('notificationStats').get(),
  ]);
  const notifications = snapshot.docs
    .map((d) => d.data() as Notification)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS);

  // [BE-27] The denormalized counter (kept in sync by writeNotification /
  // the mark-as-read route) is now the source of truth — it doesn't
  // undercount for a user with more than MAX_NOTIFICATIONS notifications
  // the way computing it from this capped slice would.
  const statsUnreadCount = (statsSnap.data() as { unreadCount?: number } | undefined)?.unreadCount;
  const unreadCount = typeof statsUnreadCount === 'number' ? statsUnreadCount : notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount }, { status: 200 });
}
