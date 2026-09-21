'use client';

import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';
import { initWishlistSync } from '../../lib/wishlist';

// Mounted once near the root (see layout.tsx) — reacts to sign-in/sign-out
// by handing the current Firebase user (or null) to lib/wishlist's sync
// entry point. Renders nothing; this is purely a side-effect bridge between
// AuthContext and the plain-module wishlist cache, the same role
// cart-context's own auth-driven useEffect plays for the cart.
export function WishlistSync() {
  const { user } = useAuth();

  useEffect(() => {
    initWishlistSync(user);
  }, [user]);

  return null;
}
