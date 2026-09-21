'use client';

import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';
import { refreshNotifications } from '../../lib/notifications';

// Mounted once near the root (see layout.tsx), same role WishlistSync plays
// for the wishlist cache — reacts to sign-in/sign-out by refreshing the
// shared notifications cache that the header bell and the notification
// center page both read from. Renders nothing.
export function NotificationsSync() {
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    refreshNotifications(user ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return null;
}
