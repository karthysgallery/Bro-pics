import type { User } from 'firebase/auth';

const STORAGE_KEY = 'bropics_wishlist';

// Same-tab components (WishlistButton instances, the header icon, the
// wishlist page) all read localStorage independently, and localStorage
// writes don't trigger a 'storage' event in the tab that made them — so a
// toggle on a product card wouldn't otherwise be reflected anywhere else
// without a page refresh. This custom event lets every mounted listener
// re-read on any change, in this tab or another.
const CHANGE_EVENT = 'bropics_wishlist_change';

// Signed-in state: once initWishlistSync(user) has fetched/merged
// successfully, remoteIds becomes the source of truth and every read/write
// below goes through the Firestore-backed API instead of localStorage —
// mirroring cart-context's local→Firestore handoff on sign-in, but without
// cart's price/stock revalidation (a wishlist entry has nothing to
// revalidate at add-time).
let currentUser: User | null = null;
let remoteIds: string[] | null = null;
// Guards a slow in-flight fetch from clobbering state after a newer
// sign-in/out already superseded it (e.g. rapid sign-out during the fetch).
let syncToken = 0;

function readLocalIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts —
    // wishlist is a non-critical convenience, fail silently.
  }
}

function emitChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getWishlistIds(): string[] {
  return remoteIds ?? readLocalIds();
}

export function isWishlisted(productId: string): boolean {
  return getWishlistIds().includes(productId);
}

/**
 * Called once per sign-in/sign-out transition (see WishlistSync, mounted
 * once near the root). On sign-in: merges whatever was in localStorage into
 * the account's Firestore wishlist (a plain id union, no conflict to
 * resolve), then switches reads/writes over to it. On sign-out: drops back
 * to localStorage. A failed fetch/merge leaves remoteIds null, so
 * getWishlistIds() keeps serving the local list rather than going empty.
 */
export async function initWishlistSync(user: User | null): Promise<void> {
  const token = ++syncToken;
  currentUser = user;

  if (!user) {
    remoteIds = null;
    emitChange();
    return;
  }

  const localIds = readLocalIds();
  try {
    const idToken = await user.getIdToken();
    if (token !== syncToken) return;

    const response = await (localIds.length > 0
      ? fetch('/api/wishlist/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ productIds: localIds }),
        })
      : fetch('/api/wishlist', { headers: { Authorization: `Bearer ${idToken}` } }));
    if (token !== syncToken || !response.ok) return;

    const body = await response.json();
    if (token !== syncToken) return;
    remoteIds = body.productIds ?? [];
    writeLocalIds([]);
    emitChange();
  } catch {
    // Network failure — stay on localStorage until the next successful sync.
  }
}

function pushRemoteChange(productId: string, isIn: boolean): void {
  const user = currentUser;
  if (!user) return;
  (async () => {
    try {
      const idToken = await user.getIdToken();
      if (isIn) {
        await fetch(`/api/wishlist?productId=${encodeURIComponent(productId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } else {
        await fetch('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ productId }),
        });
      }
    } catch {
      // Best-effort — the optimistic local update above already reflects
      // the intent; a failed sync just means the next fetch reconciles it.
    }
  })();
}

export function toggleWishlist(productId: string): boolean {
  const ids = getWishlistIds();
  const isIn = ids.includes(productId);
  const next = isIn ? ids.filter((id) => id !== productId) : [productId, ...ids];

  if (currentUser && remoteIds) {
    remoteIds = next;
    pushRemoteChange(productId, isIn);
  } else {
    writeLocalIds(next);
  }
  emitChange();
  return !isIn;
}

export function removeFromWishlist(productId: string): void {
  if (isWishlisted(productId)) toggleWishlist(productId);
}

/**
 * Explicit add, distinct from toggleWishlist — used by "move to wishlist"
 * actions (a cart line, say) where the intent is always "add," never
 * "toggle off if it happens to already be there."
 */
export function addToWishlist(productId: string): void {
  if (!isWishlisted(productId)) toggleWishlist(productId);
}

export function subscribeToWishlist(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
