import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWishlistIds,
  isWishlisted,
  toggleWishlist,
  removeFromWishlist,
  subscribeToWishlist,
  initWishlistSync,
} from './wishlist';

function makeUser(overrides: Partial<{ getIdToken: () => Promise<string> }> = {}) {
  return { uid: 'user_1', getIdToken: vi.fn().mockResolvedValue('id-token'), ...overrides } as unknown as import('firebase/auth').User;
}

describe('wishlist (guest, localStorage-backed)', () => {
  beforeEach(async () => {
    await initWishlistSync(null);
    localStorage.clear();
  });

  it('starts empty and reports nothing wishlisted', () => {
    expect(getWishlistIds()).toEqual([]);
    expect(isWishlisted('p1')).toBe(false);
  });

  it('toggles a product on then off, returning the new state each time', () => {
    expect(toggleWishlist('p1')).toBe(true);
    expect(getWishlistIds()).toEqual(['p1']);
    expect(toggleWishlist('p1')).toBe(false);
    expect(getWishlistIds()).toEqual([]);
  });

  it('removeFromWishlist is a no-op when the product was never added', () => {
    removeFromWishlist('p1');
    expect(getWishlistIds()).toEqual([]);
  });

  it('notifies subscribers on change', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToWishlist(callback);
    toggleWishlist('p1');
    expect(callback).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('wishlist (signed-in, Firestore-backed via initWishlistSync)', () => {
  const mockFetch = vi.fn();

  beforeEach(async () => {
    await initWishlistSync(null);
    localStorage.clear();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('fetches the remote list on sign-in when there is nothing local to merge', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ productIds: ['p1', 'p2'] }) });
    await initWishlistSync(makeUser());

    expect(mockFetch).toHaveBeenCalledWith('/api/wishlist', expect.objectContaining({ headers: { Authorization: 'Bearer id-token' } }));
    expect(getWishlistIds()).toEqual(['p1', 'p2']);
  });

  it('merges the local list into the account on sign-in, then clears local storage', async () => {
    localStorage.setItem('bropics_wishlist', JSON.stringify(['local-1']));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ productIds: ['local-1', 'server-1'] }) });

    await initWishlistSync(makeUser());

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/wishlist/merge',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ productIds: ['local-1'] }) })
    );
    expect(getWishlistIds()).toEqual(['local-1', 'server-1']);
    expect(localStorage.getItem('bropics_wishlist')).toBe(JSON.stringify([]));
  });

  it('falls back to localStorage when the sync fetch fails, losing nothing', async () => {
    localStorage.setItem('bropics_wishlist', JSON.stringify(['local-1']));
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await initWishlistSync(makeUser());

    expect(getWishlistIds()).toEqual(['local-1']);
  });

  it('toggling while signed in optimistically updates state and calls the API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ productIds: [] }) });
    await initWishlistSync(makeUser());

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const added = toggleWishlist('p1');

    expect(added).toBe(true);
    expect(getWishlistIds()).toEqual(['p1']);
    await vi.waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/wishlist',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ productId: 'p1' }) })
      )
    );
  });

  it('reverts to localStorage after sign-out', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ productIds: ['p1'] }) });
    await initWishlistSync(makeUser());
    expect(getWishlistIds()).toEqual(['p1']);

    await initWishlistSync(null);
    expect(getWishlistIds()).toEqual([]);
  });
});
