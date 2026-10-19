import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: (_o: unknown, h: unknown) => h }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, h: unknown) => h }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

import { handleOrderChange } from './order-notifications';

const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) } as never;
const order = { orderNo: 'BP-1', status: 'payment_confirmed', paymentStatus: 'paid', total: 1000, customerName: 'A B', addressJson: { phone: '9000000123' } };

describe('handleOrderChange', () => {
  it('asks the notifier to send the confirmation when payment is verified', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent', messageId: 'm' });
    const out = await handleOrderChange(db, { send, dueRetries: vi.fn() } as never, 'o1', { ...order, paymentStatus: 'pending', status: 'pending_payment' }, order);
    expect(out).toEqual([{ event: 'order_confirmed', status: 'sent' }]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o1', event: 'order_confirmed' }));
  });

  it('does nothing for a change that is not a lifecycle event', async () => {
    const send = vi.fn();
    expect(await handleOrderChange(db, { send, dueRetries: vi.fn() } as never, 'o1', order, { ...order, status: 'print_rendering' })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('a notifier that crashes does not throw into the order trigger', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const out = await handleOrderChange(db, { send, dueRetries: vi.fn() } as never, 'o1', { ...order, paymentStatus: 'pending', status: 'pending_payment' }, order);
    expect(out).toEqual([{ event: 'order_confirmed', status: 'error' }]);
  });

  it('a deleted order sends nothing', async () => {
    const send = vi.fn();
    expect(await handleOrderChange(db, { send, dueRetries: vi.fn() } as never, 'o1', order, undefined)).toEqual([]);
  });
});
