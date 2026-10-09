import { describe, it, expect } from 'vitest';
import { needsInvoice } from './invoices';

describe('needsInvoice', () => {
  it('fires once, when an order first becomes paid with its invoice number', () => {
    expect(needsInvoice({ paymentStatus: 'pending' }, { paymentStatus: 'paid', invoiceNo: 'KG-INV-2026-000001' })).toBe(true);
    expect(needsInvoice(undefined, { paymentStatus: 'paid', invoiceNo: 'KG-INV-2026-000001' })).toBe(true);
    // Later status changes on a paid order (photo validation, shipping…) do not.
    expect(needsInvoice({ paymentStatus: 'paid', invoiceNo: 'X' }, { paymentStatus: 'paid', invoiceNo: 'X' })).toBe(false);
    expect(needsInvoice({ paymentStatus: 'pending' }, { paymentStatus: 'pending' })).toBe(false);
    expect(needsInvoice({ paymentStatus: 'pending' }, { paymentStatus: 'failed', invoiceNo: undefined })).toBe(false);
  });
});
