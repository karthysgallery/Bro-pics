import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  BillingError,
  buildCreditNote,
  buildOnlineInvoice,
  buildPosInvoice,
  checkPayments,
  customerIdForPhone,
  financialYearOf,
  formatInvoiceNo,
  invoiceStatusFor,
  normalizeIndianMobile,
  priceLine,
  returnLines,
  sellerFrom,
  taxLinesFor,
  totalsOf,
} from './invoice-engine';
import { renderInvoicePdf } from './invoice-pdf';
import { DEFAULT_BILLING_SETTINGS, InvoiceSchema } from '../schemas/billing';

const seller = sellerFrom({ ...DEFAULT_BILLING_SETTINGS, address: '12 Gallery Street, T. Nagar, Chennai 600017', phone: '+91 90000 00000', email: 'hello@karthysgallery.in' }, { enabled: true, gstin: '33ABCDE1234F1Z5' });
const frame = { productId: 'p1', variantId: 'v1', title: 'Classic Wooden Photo Frame', variantLabel: '12x18 in · Black', sku: 'CWF-1218-BLK', unitPrice: 129900 };
const mug = { productId: 'p2', variantId: 'v2', title: 'Personalized Photo Mug', variantLabel: '11 oz · White', sku: 'MUG-11', unitPrice: 49900 };
const base = { issuedAt: '2026-10-09T06:30:00Z', createdBy: 'staff_1', seller, footer: 'Goods once sold can be exchanged within 7 days with the bill.', gst: { enabled: true, rate: 18 } };

describe('invoice engine', () => {
  it('normalises Indian mobiles and gives one customer id per number', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
    expect(() => normalizeIndianMobile('12345')).toThrow(/10-digit/);
    expect(customerIdForPhone('+919876543210')).toBe('p919876543210');
  });

  it('numbers invoices per Indian financial year (April to March, India time)', () => {
    expect(financialYearOf(new Date('2026-03-31T18:00:00Z'))).toBe(2025); // 31 Mar 23:30 IST
    expect(financialYearOf(new Date('2026-03-31T18:31:00Z'))).toBe(2026); // 1 Apr 00:01 IST
    expect(formatInvoiceNo('KG-INV', 2026, 1)).toBe('KG-INV-2026-000001');
  });

  it('prices from the catalogue and enforces the staff discount limit', () => {
    const line = priceLine(frame, { qty: 2, discountPercent: 10 }, { maxDiscountPercent: 10, canOverride: false });
    expect(line).toMatchObject({ qty: 2, unitPrice: 129900, discount: 25980, lineTotal: 233820 });
    expect(() => priceLine(frame, { qty: 1, discountPercent: 15 }, { maxDiscountPercent: 10, canOverride: false })).toThrow(/need a manager/);
    expect(priceLine(frame, { qty: 1, discountPercent: 15 }, { maxDiscountPercent: 10, canOverride: true }).discount).toBe(19485);
    expect(() => priceLine(frame, { qty: 0 }, { maxDiscountPercent: 10, canOverride: false })).toThrow(BillingError);
    expect(() => priceLine(frame, { qty: 1, discountAmount: 200000 }, { maxDiscountPercent: 100, canOverride: true })).toThrow(/more than the line total/);
  });

  it('splits GST out of the inclusive total and checks split payments add up', () => {
    expect(taxLinesFor(118000, { enabled: true, rate: 18 })).toEqual([{ rate: 18, taxable: 100000, amount: 18000 }]);
    expect(taxLinesFor(118000, { enabled: false, rate: 18 })).toEqual([]);
    expect(() => checkPayments([{ method: 'cash', amount: 100000, reference: null }], 118000, ['cash', 'upi'])).toThrow(/add up/);
    expect(() => checkPayments([{ method: 'card', amount: 118000, reference: null }], 118000, ['cash'])).toThrow(/not an accepted/);
    expect(() => checkPayments([{ method: 'cash', amount: 18000, reference: null }, { method: 'upi', amount: 100000, reference: 'UTR1' }], 118000, ['cash', 'upi'])).not.toThrow();
  });

  it('builds a POS invoice, then a credit note for a partial return priced from what was paid', () => {
    const lines = [priceLine(frame, { qty: 2, discountPercent: 10 }, { maxDiscountPercent: 10, canOverride: false }), priceLine(mug, { qty: 1 }, { maxDiscountPercent: 10, canOverride: false })];
    const inv = buildPosInvoice({ ...base, id: 'pos_s1', invoiceNo: 'KG-INV-2026-000001', saleId: 's1', customerId: 'p919876543210', customer: { name: 'Asha Kumar', phone: '+919876543210', email: null, address: null }, lines, payments: [{ method: 'upi', amount: 283720, reference: 'UTR123' }] });
    expect(InvoiceSchema.parse(inv)).toBeTruthy();
    expect(inv.total).toBe(totalsOf(lines).total);
    expect(inv.total).toBe(283720);
    const back = returnLines(inv.lines, [{ lineIndex: 0, qty: 1 }], [0]);
    expect(back[0]).toMatchObject({ qty: 1, discount: 12990, lineTotal: 116910 });
    expect(() => returnLines(inv.lines, [{ lineIndex: 0, qty: 2 }], [1])).toThrow(/only 1 can still be returned/);
    const cn = buildCreditNote({ ...base, id: 'cn_1', invoiceNo: 'KG-CN-2026-000001', original: inv, lines: back, reason: 'Size exchange', refundMethod: 'cash', reference: null });
    expect(cn).toMatchObject({ kind: 'credit_note', originalInvoiceNo: 'KG-INV-2026-000001', total: 116910, status: 'refunded' });
    expect(invoiceStatusFor(inv.total, 116910)).toBe('partially_refunded');
    expect(invoiceStatusFor(inv.total, inv.total)).toBe('refunded');
  });

  it('turns an online order into an invoice, refusing one whose figures do not add up', () => {
    const order = {
      id: 'o1', orderNo: 'BP-2026-00001', subtotal: 179800, discount: 10000, shipping: 0, total: 169800, couponCode: 'DIWALI100', customerName: 'Ravi',
      addressJson: { recipientName: 'Ravi Shankar', line1: '4 Lake View Road', line2: null, city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001', phone: '+919000000002' },
      razorpayPaymentId: 'pay_ABC', paymentProvider: 'razorpay', placedAt: '2026-10-08T10:00:00Z',
      items: [{ productId: 'p1', variantId: 'v1', title: 'Classic Wooden Photo Frame', sizeLabel: '12x18 in', frameColour: 'Black', qty: 1, unitPrice: 129900 }, { productId: 'p2', variantId: 'v2', title: 'Personalized Photo Mug', sizeLabel: '11 oz', qty: 1, unitPrice: 49900 }],
    };
    const inv = buildOnlineInvoice({ ...base, id: 'order_o1', invoiceNo: 'KG-INV-2026-000002', order, customerId: 'p919000000002', phone: '+919000000002', email: null });
    expect(inv).toMatchObject({ channel: 'online', orderNo: 'BP-2026-00001', total: 169800, discount: 10000, couponCode: 'DIWALI100', customer: { name: 'Ravi Shankar' } });
    expect(inv.shippingAddress).toEqual(['4 Lake View Road', 'Coimbatore, Tamil Nadu, 641001']);
    expect(() => buildOnlineInvoice({ ...base, id: 'x', invoiceNo: 'x', order: { ...order, total: 1 }, customerId: null, phone: null, email: null })).toThrow(/order total/);
  });

  it('names the glitter finish on an invoice line, with the frame price including its extra', () => {
    const order = {
      id: 'o2', orderNo: 'BP-2026-00002', subtotal: 139900, discount: 0, shipping: 0, total: 139900, customerName: 'Asha',
      addressJson: { recipientName: 'Asha', line1: '1 Main Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
      placedAt: '2026-10-11T10:00:00Z',
      items: [{ productId: 'p1', variantId: 'v1', title: 'Lord Murugan Photo Frame', sizeLabel: '12x18 in', frameColour: 'Royal Gold', qty: 1, unitPrice: 139900, finish: 'glitter' }],
    };
    const inv = buildOnlineInvoice({ ...base, id: 'order_o2', invoiceNo: 'KG-INV-2026-000003', order, customerId: null, phone: null, email: null });
    expect(inv.lines[0]).toMatchObject({ variantLabel: '12x18 in · Royal Gold · Glitter finish', unitPrice: 139900, lineTotal: 139900 });
  });

  it('renders a valid multi-page A4 PDF for a long bill, with ₹ and unsupported characters handled', async () => {
    const lines = Array.from({ length: 34 }, (_, i) => priceLine({ ...frame, title: i === 3 ? 'Frame with a very long name that needs to wrap onto a second line in the item column' : `${frame.title} ${i + 1}` }, { qty: 1 + (i % 3), discountPercent: i % 4 === 0 ? 5 : undefined }, { maxDiscountPercent: 10, canOverride: false }));
    const total = totalsOf(lines).total;
    const inv = buildPosInvoice({ ...base, id: 'pos_s2', invoiceNo: 'KG-INV-2026-000003', saleId: 's2', customerId: 'p919876543210', customer: { name: 'Asha கு Kumar', phone: '+919876543210', email: 'asha@example.com', address: null }, lines, payments: [{ method: 'cash', amount: total, reference: null }] });
    const bytes = await renderInvoicePdf(inv);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(Buffer.from(bytes).includes(Buffer.from('?? Kumar'))).toBe(false);
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    if (process.env.INVOICE_SAMPLE_OUT) {
      writeFileSync(`${process.env.INVOICE_SAMPLE_OUT}/long.pdf`, bytes);
      const short = buildPosInvoice({ ...base, id: 'pos_s3', invoiceNo: 'KG-INV-2026-000004', saleId: 's3', customerId: inv.customerId!, customer: inv.customer, lines: lines.slice(0, 3), payments: [{ method: 'upi', amount: totalsOf(lines.slice(0, 3)).total, reference: 'UTR4567' }] });
      writeFileSync(`${process.env.INVOICE_SAMPLE_OUT}/short.pdf`, await renderInvoicePdf(short));
    }
  });
});
