import { describe, it, expect } from 'vitest';
import { paymentState, filterOrders, countOrders, filtersFromParams, filtersToParams, istDayStart, DEFAULT_FILTERS, type OrderRow } from './admin-orders-view';

const base: OrderRow = {
  id: 'o', orderNo: 'BP-2026-00001', status: 'photo_validation', paymentStatus: 'paid', paymentMode: 'prepaid', paymentProvider: 'razorpay',
  total: 49900, amountPaidOnline: 49900, amountDueOnDelivery: 0, placedAt: '2026-11-21T06:00:00.000Z', userId: 'u1', customerName: 'Priya R',
  phone: '+919000000011', email: 'priya@example.com', city: 'Chennai', state: 'Tamil Nadu', pincode: '600028', productTitle: 'Your Photo Frame',
  productImage: null, productCount: 1, hasGlitter: false, razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', invoiceNo: null, refundedAmount: 0, paymentFailure: null,
};
const row = (over: Partial<OrderRow>): OrderRow => ({ ...base, ...over });

describe('paymentState', () => {
  it('keeps the payment side separate from production', () => {
    expect(paymentState(row({}))).toBe('paid');
    expect(paymentState(row({ status: 'pending_payment', paymentStatus: 'failed' }))).toBe('failed');
    expect(paymentState(row({ status: 'pending_payment', paymentStatus: 'pending' }))).toBe('pending');
    expect(paymentState(row({ status: 'cancelled', paymentStatus: 'pending' }))).toBe('pending');
    expect(paymentState(row({ status: 'refunded' }))).toBe('refunded');
    expect(paymentState(row({ status: 'delivered', refundedAmount: 10000 }))).toBe('paid');
    expect(paymentState(row({ status: 'delivered', refundedAmount: 49900 }))).toBe('refunded');
  });
});

describe('filterOrders', () => {
  const now = Date.parse('2026-11-21T10:00:00.000Z'); // 15:30 IST
  const rows = [
    row({ id: 'a', orderNo: 'BP-2026-00010', placedAt: '2026-11-21T00:30:00.000Z', total: 10000 }), // 06:00 IST today
    row({ id: 'b', orderNo: 'BP-2026-00011', placedAt: '2026-11-20T17:00:00.000Z', status: 'pending_payment', paymentStatus: 'failed', total: 90000 }), // 22:30 IST yesterday
    row({ id: 'c', orderNo: 'BP-2026-00012', placedAt: '2026-11-20T19:00:00.000Z', paymentMode: 'partial_cod', status: 'packed', customerName: 'Arun K', phone: '+919876543210', productTitle: 'Spotify Song Frame' }), // 00:30 IST today
  ];

  it('combines payment, date and method filters, using India days', () => {
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, date: 'today' }, now).map((o) => o.id).sort()).toEqual(['a', 'c']);
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, payment: 'failed', date: 'yesterday' }, now).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, payment: 'failed', date: 'today' }, now)).toEqual([]);
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, method: 'partial_cod' }, now).map((o) => o.id)).toEqual(['c']);
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, stage: 'ready' }, now).map((o) => o.id)).toEqual(['c']);
  });

  it('searches order number, name, phone digits and product', () => {
    const ids = (q: string) => filterOrders(rows, { ...DEFAULT_FILTERS, q }, now).map((o) => o.id);
    expect(ids('#bp-2026-00011')).toEqual(['b']);
    expect(ids('arun')).toEqual(['c']);
    expect(ids('98765 43210')).toEqual(['c']);
    expect(ids('spotify')).toEqual(['c']);
  });

  it('sorts by date or amount', () => {
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, sort: 'amount_high' }, now)[0].id).toBe('b');
    expect(filterOrders(rows, { ...DEFAULT_FILTERS, sort: 'oldest' }, now)[0].id).toBe('b');
    expect(filterOrders(rows, { ...DEFAULT_FILTERS }, now)[0].id).toBe('a');
  });
});

describe('countOrders', () => {
  it('counts payment states and the production cards', () => {
    const c = countOrders([row({}), row({ status: 'packed' }), row({ status: 'pending_payment', paymentStatus: 'failed' }), row({ status: 'refunded' })]);
    expect(c).toMatchObject({ total: 4, paid: 2, failed: 1, refunded: 1, processing: 1, readyToShip: 1, photoCheck: 1 });
  });
});

describe('filters in the address bar', () => {
  it('round-trips and ignores unknown values', () => {
    const f = { ...DEFAULT_FILTERS, payment: 'failed' as const, date: 'today' as const, q: 'priya' };
    expect(filtersFromParams(new URLSearchParams(filtersToParams(f).slice(1)))).toEqual(f);
    expect(filtersFromParams(new URLSearchParams('payment=hacked&stage=nope'))).toEqual(DEFAULT_FILTERS);
  });
  it('istDayStart is midnight in India', () => {
    expect(new Date(istDayStart(Date.parse('2026-11-21T10:00:00Z'))).toISOString()).toBe('2026-11-20T18:30:00.000Z');
  });
});
