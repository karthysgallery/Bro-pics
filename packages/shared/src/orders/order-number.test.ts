import { describe, it, expect, vi } from 'vitest';
import { generateOrderNo } from './order-number';
import type { CounterTransaction } from './order-number';

function makeFakeTransaction(currentValue: number | undefined): CounterTransaction {
  const docSnapshot = {
    exists: currentValue !== undefined,
    data: () => (currentValue !== undefined ? { value: currentValue } : undefined),
  };
  return {
    get: vi.fn().mockResolvedValue(docSnapshot),
    set: vi.fn(),
  };
}

describe('generateOrderNo', () => {
  it('starts at 1 when the counter does not exist yet', async () => {
    const tx = makeFakeTransaction(undefined);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00001');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 1 });
  });

  it('increments the existing counter', async () => {
    const tx = makeFakeTransaction(183);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00184');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 184 });
  });

  it('pads to 5 digits', async () => {
    const tx = makeFakeTransaction(9);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00010');
  });
});
