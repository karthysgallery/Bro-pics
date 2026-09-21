import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeNotification } from './notify';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ id: 'notif_1', set: mockSet }));
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: mockDoc })) })),
  })),
} as unknown as import('firebase-admin/firestore').Firestore;

describe('writeNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
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
});
