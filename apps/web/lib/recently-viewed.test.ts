import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordProductView,
  getRecentlyViewedIds,
  removeRecentlyViewed,
  clearRecentlyViewed,
  subscribeToRecentlyViewed,
} from './recently-viewed';

describe('recently-viewed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a view, most-recent first, deduping an existing entry', () => {
    recordProductView('p1');
    recordProductView('p2');
    recordProductView('p1');
    expect(getRecentlyViewedIds()).toEqual(['p1', 'p2']);
  });

  it('caps history at 8 items', () => {
    for (let i = 0; i < 10; i++) recordProductView(`p${i}`);
    expect(getRecentlyViewedIds()).toHaveLength(8);
    expect(getRecentlyViewedIds()[0]).toBe('p9');
  });

  it('removes a single item', () => {
    recordProductView('p1');
    recordProductView('p2');
    removeRecentlyViewed('p1');
    expect(getRecentlyViewedIds()).toEqual(['p2']);
  });

  it('clears the whole history', () => {
    recordProductView('p1');
    recordProductView('p2');
    clearRecentlyViewed();
    expect(getRecentlyViewedIds()).toEqual([]);
  });

  it('notifies subscribers on record/remove/clear', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToRecentlyViewed(callback);
    recordProductView('p1');
    removeRecentlyViewed('p1');
    clearRecentlyViewed();
    expect(callback).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
