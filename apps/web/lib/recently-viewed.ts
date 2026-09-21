const STORAGE_KEY = 'bropics_recently_viewed';
const MAX_ITEMS = 8;

// Same rationale as wishlist's CHANGE_EVENT: localStorage writes don't fire
// a 'storage' event in the tab that made them, so a remove/clear action in
// one mounted rail wouldn't otherwise be reflected in another without a
// page reload.
const CHANGE_EVENT = 'bropics_recently_viewed_change';

function emitChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordProductView(productId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentlyViewedIds().filter((id) => id !== productId);
    const next = [productId, ...existing].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitChange();
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts —
    // recently-viewed is a non-critical convenience, fail silently.
  }
}

export function getRecentlyViewedIds(excludeProductId?: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return excludeProductId ? ids.filter((id) => id !== excludeProductId) : ids;
  } catch {
    return [];
  }
}

export function removeRecentlyViewed(productId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = getRecentlyViewedIds().filter((id) => id !== productId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitChange();
  } catch {
    // Same non-critical-convenience rationale as above.
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    emitChange();
  } catch {
    // Same non-critical-convenience rationale as above.
  }
}

export function subscribeToRecentlyViewed(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
