import { describe, it, expect } from 'vitest';
import { buildBillingReport, istDay } from './reports';
import type { Invoice } from '../schemas/billing';

const inv = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'x', invoiceNo: 'x', kind: 'invoice', channel: 'pos', orderId: null, orderNo: null, saleId: null, originalInvoiceId: null, originalInvoiceNo: null, customerId: null,
    customer: { name: 'A', phone: null, email: null, address: null }, shippingAddress: null, seller: { name: 'K', legalName: null, address: null, phone: null, email: null, gstin: null },
    lines: [{ productId: 'p1', variantId: 'v1', title: 'A4 Frame', variantLabel: null, sku: null, qty: 2, unitPrice: 50000, discount: 10000, lineTotal: 90000 }],
    subtotal: 100000, discount: 10000, couponCode: null, shipping: 0, total: 90000, taxLines: [], payments: [{ method: 'cash', amount: 90000, reference: null }],
    status: 'paid', refundedAmount: 0, footer: null, pdfPath: null, pdfGeneratedAt: null, whatsapp: { status: 'not_sent', messageId: null, error: null, at: null }, issuedAt: '2026-10-09T05:00:00Z', createdBy: 's',
    ...over,
  }) as Invoice;

describe('buildBillingReport', () => {
  it('adds up sales, discounts, returns and net, by channel, payment, day, product and category', () => {
    const r = buildBillingReport(
      [
        inv({}),
        inv({ channel: 'online', payments: [{ method: 'online', amount: 50000, reference: null }], total: 50000, discount: 0, lines: [{ productId: 'p2', variantId: 'v2', title: 'Mug', variantLabel: null, sku: null, qty: 1, unitPrice: 50000, discount: 0, lineTotal: 50000 }], issuedAt: '2026-10-09T20:00:00Z' }),
        inv({ kind: 'credit_note', total: 45000, payments: [{ method: 'cash', amount: 45000, reference: null }], lines: [{ productId: 'p1', variantId: 'v1', title: 'A4 Frame', variantLabel: null, sku: null, qty: 1, unitPrice: 50000, discount: 5000, lineTotal: 45000 }] }),
        inv({ status: 'cancelled', total: 999999 }),
      ],
      { productCategory: new Map([['p1', 'frames'], ['p2', 'gifts']]), names: new Map([['frames', 'Frames'], ['gifts', 'Gifts']]) }
    );
    expect(r).toMatchObject({ bills: 2, sales: 140000, discounts: 10000, refunds: 45000, net: 95000 });
    expect(r.byChannel).toEqual({ online: { bills: 1, sales: 50000, refunds: 0 }, pos: { bills: 1, sales: 90000, refunds: 45000 } });
    expect(r.byPayment).toEqual([{ method: 'online', amount: 50000 }, { method: 'cash', amount: 45000 }]);
    expect(r.byDay.map((d) => d.day)).toEqual(['2026-10-09', '2026-10-10']); // 20:00 UTC is the next India day
    expect(r.byProduct[0]).toMatchObject({ title: 'Mug', revenue: 50000 });
    expect(r.byProduct[1]).toMatchObject({ title: 'A4 Frame', qty: 1, revenue: 45000 });
    expect(r.byCategory.map((c) => c.name)).toEqual(['Gifts', 'Frames']);
  });
  it('uses India days', () => {
    expect(istDay('2026-10-09T18:29:00Z')).toBe('2026-10-09');
    expect(istDay('2026-10-09T18:31:00Z')).toBe('2026-10-10');
  });
});
