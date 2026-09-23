import { describe, it, expect, vi } from 'vitest';
import { generateInvoiceNo } from './invoice-number';
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

describe('generateInvoiceNo', () => {
  it('starts at 1 when the counter does not exist yet', async () => {
    const tx = makeFakeTransaction(undefined);
    const invoiceNo = await generateInvoiceNo(tx, 2026);
    expect(invoiceNo).toBe('INV-2026-00001');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 1 });
  });

  it('increments the existing counter, independently of generateOrderNo\'s own counter', async () => {
    const tx = makeFakeTransaction(41);
    const invoiceNo = await generateInvoiceNo(tx, 2026);
    expect(invoiceNo).toBe('INV-2026-00042');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 42 });
  });

  it('pads to 5 digits', async () => {
    const tx = makeFakeTransaction(9);
    const invoiceNo = await generateInvoiceNo(tx, 2026);
    expect(invoiceNo).toBe('INV-2026-00010');
  });
});
