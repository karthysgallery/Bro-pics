'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import type { Notification, NotificationPreferences } from '@bro-pics/shared';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { useToast } from '../../../../components/ui/Toast';
import { PageSkeleton, Skeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Card } from '../../../../components/ui/Card';
import {
  getNotifications,
  refreshNotifications,
  markNotificationRead,
  subscribeToNotifications,
} from '../../../../lib/notifications';

const DEFAULT_PREFERENCES: NotificationPreferences = { priceDrop: true, offers: true, recommendations: true };

const MARKETING_TOGGLES: Array<{ key: keyof NotificationPreferences; label: string; desc: string }> = [
  { key: 'priceDrop', label: 'Price drops', desc: 'A frame you wishlisted goes on sale' },
  { key: 'offers', label: 'Offers & coupons', desc: 'New discount codes and promotions' },
  { key: 'recommendations', label: 'Recommendations', desc: 'Picks based on what you have browsed' },
];

// Transactional categories are always on — shown here only as a readout, per
// the schema's own "never user-togglable" rule (packages/shared/src/schemas/notification.ts).
const TRANSACTIONAL_LABEL = 'Order, payment, shipping, delivery and refund updates are always sent — these keep you informed about money already spent.';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function NotificationRow({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-ink">{notification.title}</p>
        {!notification.isRead && <span className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" aria-hidden="true" />}
      </div>
      <p className="text-sm text-ink/70 mt-0.5">{notification.body}</p>
      <p className="text-2xs text-ink/45 mt-1.5">{timeAgo(notification.createdAt)}</p>
    </>
  );

  if (notification.linkHref) {
    return (
      <Card as="li" className="hover:border-accent transition-colors">
        <Link href={notification.linkHref} onClick={() => onRead(notification.id)} className="block">
          {content}
        </Link>
      </Card>
    );
  }

  return (
    <Card as="li">
      <button type="button" onClick={() => onRead(notification.id)} className="block w-full text-left" disabled={notification.isRead}>
        {content}
      </button>
    </Card>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(getNotifications());
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    refreshNotifications(user ?? null).then(() => setLoaded(true));
    return subscribeToNotifications(() => setNotifications(getNotifications()));
  }, [uid, user]);

  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getFirebaseApp());
    getDoc(doc(db, 'users', uid)).then((snapshot) => {
      const data = snapshot.data() as { notificationPreferences?: NotificationPreferences } | undefined;
      setPreferences(data?.notificationPreferences ?? DEFAULT_PREFERENCES);
      setPreferencesLoaded(true);
    });
  }, [uid]);

  if (!user) return <SignedOutNotice action="see your notifications" />;
  if (!loaded) return <PageSkeleton rows={3} />;

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreferences(true);
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'users', user.uid), { notificationPreferences: next, updatedAt: new Date() }, { merge: true });
    } catch {
      setPreferences(preferences);
      showToast('Could not save your preferences. Try again.', 'error');
    } finally {
      setSavingPreferences(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-8">
      <div>
        <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
          ← Back to account
        </Link>
        <h1 className="text-2xl font-semibold text-ink mt-2">Notifications</h1>
      </div>

      <section className="flex flex-col gap-3">
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" message="Order updates and offers will show up here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onRead={(id) => markNotificationRead(user, id)} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-lg font-semibold text-ink">Preferences</h2>
        <p className="text-sm text-ink/60">{TRANSACTIONAL_LABEL}</p>

        {!preferencesLoaded ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex flex-col gap-3 mt-1">
            {MARKETING_TOGGLES.map((toggle) => (
              <Card as="li" key={toggle.key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink text-sm">{toggle.label}</p>
                  <p className="text-sm text-ink/60">{toggle.desc}</p>
                </div>
                <label className="inline-flex items-center shrink-0">
                  <span className="sr-only">{toggle.label}</span>
                  <input
                    type="checkbox"
                    checked={preferences[toggle.key]}
                    disabled={savingPreferences}
                    onChange={(e) => handleToggle(toggle.key, e.target.checked)}
                    className="w-5 h-5 accent-gold"
                  />
                </label>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
