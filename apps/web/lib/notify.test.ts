import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeNotification } from './notify';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockStatsSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      collection: vi.fn((subName: string) => {
        if (subName === 'private') return { doc: vi.fn(() => ({ set: mockStatsSet })) };
        return { doc: vi.fn(() => ({ id: 'notif_1', set: mockSet })) };
      }),
    })),
  })),
} as unknown as import('firebase-admin/firestore').Firestore;

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { increment: (n: number) => ({ __increment: n }) } }));

describe('writeNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockStatsSet.mockResolvedValue(undefined);
  });

  it('writes a schema-valid notification to users/{uid}/notifications', async () => {
    await writeNotification(mockDb, 'user_1', 'shipping', 'Your order shipped', 'BlueDart is on the way.', '/orders/order_1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif_1',
        userId: 'user_1',
        category: 'shipping',
        title: 'Your order shipped',
        body: 'BlueDart is on the way.',
        linkHref: '/orders/order_1',
        isRead: false,
      })
    );
  });

  it('defaults linkHref to null when omitted', async () => {
    await writeNotification(mockDb, 'user_1', 'order', 'Order cancelled', 'Your order was cancelled.');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ linkHref: null }));
  });

  it('[BE-27] increments the denormalized unread counter at users/{uid}/private/notificationStats', async () => {
    await writeNotification(mockDb, 'user_1', 'order', 'Order cancelled', 'Your order was cancelled.');
    expect(mockStatsSet).toHaveBeenCalledWith({ unreadCount: { __increment: 1 } }, { merge: true });
  });
});
