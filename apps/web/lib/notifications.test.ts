import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getNotifications,
  getUnreadCount,
  refreshNotifications,
  markNotificationRead,
  subscribeToNotifications,
} from './notifications';

function makeUser(overrides: Partial<{ getIdToken: () => Promise<string> }> = {}) {
  return { uid: 'user_1', getIdToken: vi.fn().mockResolvedValue('id-token'), ...overrides } as unknown as import('firebase/auth').User;
}

describe('notifications (shared client cache)', () => {
  const mockFetch = vi.fn();

  beforeEach(async () => {
    await refreshNotifications(null);
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('starts empty when signed out', () => {
    expect(getNotifications()).toEqual([]);
    expect(getUnreadCount()).toBe(0);
  });

  it('fetches and caches notifications on refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [{ id: 'n1', userId: 'user_1', category: 'order', title: 'Order shipped', body: 'x', linkHref: null, isRead: false, createdAt: '2026-09-20T00:00:00.000Z' }],
        unreadCount: 1,
      }),
    });

    await refreshNotifications(makeUser());

    expect(getNotifications()).toHaveLength(1);
    expect(getUnreadCount()).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/notifications', { headers: { Authorization: 'Bearer id-token' } });
  });

  it('leaves the cache untouched on a failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await refreshNotifications(makeUser());
    expect(getNotifications()).toEqual([]);
    expect(getUnreadCount()).toBe(0);
  });

  it('notifies subscribers on refresh', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) });
    const callback = vi.fn();
    const unsubscribe = subscribeToNotifications(callback);
    await refreshNotifications(makeUser());
    expect(callback).toHaveBeenCalled();
    unsubscribe();
  });

  it('optimistically marks a notification read, then calls the API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [{ id: 'n1', userId: 'user_1', category: 'order', title: 'Order shipped', body: 'x', linkHref: null, isRead: false, createdAt: '2026-09-20T00:00:00.000Z' }],
        unreadCount: 1,
      }),
    });
    const user = makeUser();
    await refreshNotifications(user);

    mockFetch.mockResolvedValueOnce({ ok: true });
    await markNotificationRead(user, 'n1');

    expect(getUnreadCount()).toBe(0);
    expect(getNotifications()[0].isRead).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/notifications/n1/read', {
      method: 'POST',
      headers: { Authorization: 'Bearer id-token' },
    });
  });

  it('is a no-op when marking an already-read notification', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [{ id: 'n1', userId: 'user_1', category: 'order', title: 'Order shipped', body: 'x', linkHref: null, isRead: true, createdAt: '2026-09-20T00:00:00.000Z' }],
        unreadCount: 0,
      }),
    });
    const user = makeUser();
    await refreshNotifications(user);

    await markNotificationRead(user, 'n1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
