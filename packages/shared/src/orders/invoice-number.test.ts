import { describe, it, expect, vi } from 'vitest';
import { generateInvoiceNo } from './invoice-number';
import type { CounterTransaction } from './order-number';

function makeFakeTransaction(currentValue: number | undefined): CounterTransaction {
  const docSnapshot = { exists: currentValue !== undefined, data: () => (currentValue !== undefined ? { value: currentValue } : undefined) };
  return { get: vi.fn().mockResolvedValue(docSnapshot), set: vi.fn() };
}

describe('generateInvoiceNo', () => {
  it('starts at 1 in a new financial year, on its own per-year counter', async () => {
    const tx = makeFakeTransaction(undefined);
    expect(await generateInvoiceNo(tx, new Date('2026-10-09T06:00:00Z'))).toBe('KG-INV-2026-000001');
    expect(tx.get).toHaveBeenCalledWith({ path: 'counters/invoice-FY2026' });
    expect(tx.set).toHaveBeenCalledWith({ path: 'counters/invoice-FY2026' }, { value: 1 });
  });

  it('continues the sequence with the configured prefix; January belongs to the previous financial year', async () => {
    const tx = makeFakeTransaction(41);
    expect(await generateInvoiceNo(tx, new Date('2027-01-15T06:00:00Z'), 'KGS')).toBe('KGS-2026-000042');
  });

  it('keeps credit notes on their own sequence', async () => {
    const tx = makeFakeTransaction(9);
    expect(await generateInvoiceNo(tx, new Date('2026-10-09T06:00:00Z'), 'KG-CN', 'credit_note')).toBe('KG-CN-2026-000010');
    expect(tx.get).toHaveBeenCalledWith({ path: 'counters/creditNote-FY2026' });
  });
});
