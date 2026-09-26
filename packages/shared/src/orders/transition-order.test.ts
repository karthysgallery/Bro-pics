import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transitionOrder, buildOrderTransitionEvent, OrderNotFoundError, InvalidTransitionError } from './transition-order';
import { allowedTransitionsFrom } from './status-transitions';

describe('buildOrderTransitionEvent', () => {
  it('builds an event with the given status, note, and actor', () => {
    const event = buildOrderTransitionEvent('event_1', 'in_production', 'staff_1', 'Ready to print');
    expect(event).toEqual(
      expect.objectContaining({ id: 'event_1', status: 'in_production', note: 'Ready to print', createdBy: 'staff_1', courier: null, awbNumber: null })
    );
  });

  it('includes courier/awbNumber when given', () => {
    const event = buildOrderTransitionEvent('event_1', 'shipped', 'staff_1', null, 'BlueDart', 'BD123');
    expect(event.courier).toBe('BlueDart');
    expect(event.awbNumber).toBe('BD123');
  });
});

describe('transitionOrder', () => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockRunTransaction = vi.fn();
  const mockEventDoc = vi.fn(() => ({ id: 'event_1' }));
  const mockOrderRef = { collection: vi.fn(() => ({ doc: mockEventDoc })) };
  const mockDb = {
    collection: vi.fn(() => ({ doc: vi.fn(() => mockOrderRef) })),
    runTransaction: mockRunTransaction,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockGet, set: mockSet, update: mockUpdate })
    );
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    await expect(transitionOrder(mockDb, { orderId: 'order_1', toStatus: 'paid', actorUid: 'staff_1' })).rejects.toBeInstanceOf(
      OrderNotFoundError
    );
  });

  it('throws InvalidTransitionError carrying the allowed targets on an illegal transition', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'delivered' }) });
    try {
      await transitionOrder(mockDb, { orderId: 'order_1', toStatus: 'paid', actorUid: 'staff_1' });
      expect.fail('expected transitionOrder to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const invalid = error as InvalidTransitionError;
      expect(invalid.from).toBe('delivered');
      expect(invalid.to).toBe('paid');
      expect(invalid.allowed).toEqual(allowedTransitionsFrom('delivered'));
    }
  });

  it('writes an event and updates the order status on a valid transition', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'in_production' }) });
    const result = await transitionOrder(mockDb, { orderId: 'order_1', toStatus: 'printed_packed', actorUid: 'staff_1', note: 'Done' });
    expect(result).toEqual({ orderId: 'order_1', fromStatus: 'in_production', toStatus: 'printed_packed' });
    expect(mockSet).toHaveBeenCalledWith({ id: 'event_1' }, expect.objectContaining({ status: 'printed_packed', note: 'Done' }));
    expect(mockUpdate).toHaveBeenCalledWith(mockOrderRef, { status: 'printed_packed' });
  });

  it('merges extraOrderFields onto the order update', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'printed_packed' }) });
    await transitionOrder(mockDb, {
      orderId: 'order_1',
      toStatus: 'shipped',
      actorUid: 'staff_1',
      extraOrderFields: { courier: 'BlueDart', awbNumber: 'BD123' },
    });
    expect(mockUpdate).toHaveBeenCalledWith(mockOrderRef, { status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123' });
  });
});
