import type { User } from 'firebase/auth';
import type { Notification } from '@bro-pics/shared';

// Same same-tab pub-sub pattern as lib/wishlist.ts's CHANGE_EVENT — a plain
// module-level cache read by both the header bell (badge count only) and the
// notification-center page (full list), kept in sync without prop drilling.
const CHANGE_EVENT = 'bropics_notifications_change';

let notifications: Notification[] = [];
let unreadCount = 0;
// Guards a slow in-flight fetch from clobbering state after a newer
// sign-in/out already superseded it — same guard shape as wishlist's syncToken.
let syncToken = 0;

function emitChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getNotifications(): Notification[] {
  return notifications;
}

export function getUnreadCount(): number {
  return unreadCount;
}

export function subscribeToNotifications(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/** Called on sign-in/sign-out and whenever the notification-center page mounts. */
export async function refreshNotifications(user: User | null): Promise<void> {
  const token = ++syncToken;
  if (!user) {
    notifications = [];
    unreadCount = 0;
    emitChange();
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${idToken}` } });
    if (token !== syncToken || !response.ok) return;
    const body = await response.json();
    notifications = body.notifications ?? [];
    unreadCount = body.unreadCount ?? 0;
    emitChange();
  } catch {
    // Network failure — leave the last-known cache in place.
  }
}

export async function markNotificationRead(user: User, id: string): Promise<void> {
  const target = notifications.find((n) => n.id === id);
  if (!target || target.isRead) return;

  notifications = notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  unreadCount = Math.max(0, unreadCount - 1);
  emitChange();

  try {
    const idToken = await user.getIdToken();
    await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
  } catch {
    // Best-effort — the optimistic update above already reflects the intent;
    // the next refreshNotifications() call reconciles it if this failed.
  }
}
