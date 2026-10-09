import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { PDFDocument } from 'pdf-lib';
import { createOnlineInvoice, createPosReturn, createPosSale, finishInvoice, recordOnlineRefund, type InvoiceBucket } from './invoice-service';
import { createWhatsAppService, MockTransport } from '../whatsapp/service';
import type { Customer, Invoice, PosSale, WhatsAppMessage } from '../schemas/billing';

// Real Firestore transactions (emulator). Run:
//   firebase emulators:exec --only firestore "cd packages/shared && npx vitest run src/billing"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

class MemoryBucket implements InvoiceBucket {
  files = new Map<string, Buffer>();
  file(path: string) {
    return { save: async (data: Buffer) => void this.files.set(path, data) };
  }
}

describe.skipIf(!enabled)('invoice service (Firestore emulator)', { timeout: 20_000 }, () => {
  let db: Firestore;
  const run = Math.random().toString(36).slice(2, 8);
  const P = `pp_${run}`;
  const V = `vv_${run}`;
  const phone = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  beforeAll(async () => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
    await db.collection('settings').doc('billing').set({ businessName: 'Karthys Gallery', invoicePrefix: 'KG-INV', creditNotePrefix: 'KG-CN', paymentMethods: ['cash', 'upi', 'card'], maxStaffDiscountPercent: 10, whatsappInvoices: true, address: 'Chennai' });
    await db.collection('settings').doc('gst').set({ gstEnabled: true, taxRate: 18, gstin: '33ABCDE1234F1Z5' });
  });
  beforeEach(async () => {
    await db.collection('products').doc(P).set({ title: 'A4 Black Frame', isActive: true, status: 'published' });
    await db.collection('products').doc(P).collection('variants').doc(V).set({ sku: 'A4-BLK', sizeLabel: 'A4', frameColour: 'Black', price: 49900, isActive: true, trackStock: true, stockQty: 20, stockStatus: 'in_stock' });
  });
  const stock = async () => (await db.collection('products').doc(P).collection('variants').doc(V).get()).data()!.stockQty as number;
  const sale = (req: string, extra: Partial<Parameters<typeof createPosSale>[1]> = {}) =>
    createPosSale(db, {
      staffUid: 'staff_1',
      canOverrideDiscount: false,
      clientRequestId: req,
      customer: { phone, name: 'Asha Kumar' },
      lines: [{ productId: P, variantId: V, qty: 3, discountPercent: 10 }],
      payments: [{ method: 'upi', amount: 134730, reference: 'UTR1' }],
      consent: { transactional: 'opted_in', marketing: null },
      ...extra,
    });

  it('POS: prices on the server, takes 3 from the shared stock (20 → 17), numbers the bill, links the customer, and a double-click returns the same bill', async () => {
    const first = await sale(`req_${run}_a`);
    expect(first).toMatchObject({ created: true, total: 134730, discount: 14970 });
    expect(first.invoiceNo).toMatch(/^KG-INV-2026-\d{6}$/);
    expect(await stock()).toBe(17);
    const again = await sale(`req_${run}_a`);
    expect(again).toMatchObject({ created: false, invoiceNo: first.invoiceNo });
    expect(await stock()).toBe(17);
    const inv = (await db.collection('invoices').doc(first.invoiceId).get()).data() as Invoice;
    expect(inv).toMatchObject({ channel: 'pos', status: 'paid', total: 134730, customer: { name: 'Asha Kumar', phone } });
    expect(inv.taxLines[0]).toMatchObject({ rate: 18 });
    expect((await db.collection('invoiceNumbers').doc(first.invoiceNo).get()).exists).toBe(true);
    const customer = (await db.collection('customers').doc(`p${phone.slice(1)}`).get()).data() as Customer;
    expect(customer.stats.posPurchases).toBeGreaterThanOrEqual(1);
    expect(customer.consent.transactional).toMatchObject({ status: 'opted_in', source: 'pos' });
  });

  it('POS: links the bill to the website account that has the same mobile number', async () => {
    const other = `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await db.collection('users').doc(`acct_${run}`).set({ phone: other, displayName: 'Ravi' });
    await sale(`req_${run}_acct`, { customer: { phone: other, name: 'Ravi' } });
    expect(((await db.collection('customers').doc(`p${other.slice(1)}`).get()).data() as Customer).userId).toBe(`acct_${run}`);
  });

  it('POS: refuses tampered prices, over-limit discounts, wrong payments and more than is on hand — and writes nothing', async () => {
    await expect(sale(`req_${run}_b`, { lines: [{ productId: P, variantId: V, qty: 1, discountPercent: 50 }], payments: [{ method: 'cash', amount: 24950 }] })).rejects.toThrow(/need a manager/);
    await expect(sale(`req_${run}_c`, { payments: [{ method: 'upi', amount: 100 }] })).rejects.toThrow(/add up/);
    await expect(sale(`req_${run}_d`, { lines: [{ productId: P, variantId: V, qty: 21 }], payments: [{ method: 'cash', amount: 21 * 49900 }] })).rejects.toThrow(/Only 20 left/);
    expect(await stock()).toBe(20);
  });

  it('POS return: a numbered credit note, units back on the shelf, the bill marked partially refunded; a repeat changes nothing', async () => {
    const s = await sale(`req_${run}_e`);
    const ret = await createPosReturn(db, { saleId: s.saleId, staffUid: 'staff_1', clientRequestId: `ret_${run}`, items: [{ lineIndex: 0, qty: 1 }], refundMethod: 'cash', reason: 'Wrong size', restock: true });
    expect(ret).toMatchObject({ created: true, amount: 44910 });
    expect(ret.creditNoteNo).toMatch(/^KG-CN-2026-\d{6}$/);
    expect(await stock()).toBe(18);
    expect(((await db.collection('posSales').doc(s.saleId).get()).data() as PosSale)).toMatchObject({ returnedQty: [1], status: 'partially_returned', refundedAmount: 44910 });
    expect(((await db.collection('invoices').doc(s.invoiceId).get()).data() as Invoice).status).toBe('partially_refunded');
    expect((await createPosReturn(db, { saleId: s.saleId, staffUid: 'staff_1', clientRequestId: `ret_${run}`, items: [{ lineIndex: 0, qty: 1 }], refundMethod: 'cash', reason: 'Wrong size', restock: true })).created).toBe(false);
    expect(await stock()).toBe(18);
    await expect(createPosReturn(db, { saleId: s.saleId, staffUid: 'staff_1', clientRequestId: `ret2_${run}`, items: [{ lineIndex: 0, qty: 3 }], refundMethod: 'cash', reason: null, restock: true })).rejects.toThrow(/only 2 can still be returned/);
  });

  it('online: a paid order becomes one invoice (a retried trigger makes no copy), linked to the same customer as the store; a refund makes a credit note', async () => {
    const orderId = `o_${run}`;
    await db.collection('users').doc(`u_${run}`).set({ phone, email: 'asha@example.com', displayName: 'Asha' });
    await db.collection('orders').doc(orderId).set({ orderNo: `BP-2026-${run}`, invoiceNo: `KG-INV-2026-9${run}`, paymentStatus: 'paid', status: 'payment_confirmed', userId: `u_${run}`, subtotal: 99800, discount: 0, shipping: 0, total: 99800, addressJson: { recipientName: 'Asha Kumar', line1: '4 Lake Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', phone }, placedAt: new Date(), paymentProvider: 'mock' });
    await db.collection('orders').doc(orderId).collection('items').doc('i1').set({ productId: P, variantId: V, title: 'A4 Black Frame', sizeLabel: 'A4', qty: 2, unitPrice: 49900 });
    const [a, b] = await Promise.all([createOnlineInvoice(db, orderId), createOnlineInvoice(db, orderId)]);
    expect([a?.created, b?.created].filter(Boolean)).toHaveLength(1);
    const inv = (await db.collection('invoices').doc(`order_${orderId}`).get()).data() as Invoice;
    expect(inv).toMatchObject({ channel: 'online', orderNo: `BP-2026-${run}`, total: 99800, customerId: `p${phone.slice(1)}`, shippingAddress: ['4 Lake Road', 'Chennai, Tamil Nadu, 600001'] });
    const customer = (await db.collection('customers').doc(`p${phone.slice(1)}`).get()).data() as Customer;
    expect(customer).toMatchObject({ userId: `u_${run}` });
    expect(customer.stats.onlineOrders).toBe(1);
    const refund = await recordOnlineRefund(db, { orderId, refundId: `rf_${run}`, amount: 49900, reason: 'Damaged in transit', reference: 'rfnd_1' });
    expect(refund?.created).toBe(true);
    expect(((await db.collection('invoices').doc(`order_${orderId}`).get()).data() as Invoice)).toMatchObject({ status: 'partially_refunded', refundedAmount: 49900 });
    expect((await recordOnlineRefund(db, { orderId, refundId: `rf_${run}`, amount: 49900, reason: null, reference: null }))?.created).toBe(false);
  });

  it('finish: stores the PDF and sends it on WhatsApp; an opted-out customer is skipped; delivery status flows back to the invoice', async () => {
    const s = await sale(`req_${run}_f`);
    const transport = new MockTransport();
    const whatsapp = createWhatsAppService({ db, transport });
    const bucket = new MemoryBucket();
    const done = await finishInvoice({ db, bucket, whatsapp }, s.invoiceId, { send: true });
    expect(done.whatsapp.status).toBe('sent');
    expect(done.pdfPath).toMatch(/^invoices\/FY2026\/pos_/);
    expect((await PDFDocument.load(bucket.files.get(done.pdfPath!)!)).getPageCount()).toBe(1);
    expect(transport.sent[0]).toMatchObject({ to: phone, template: 'karthys_invoice' });
    expect(JSON.stringify(transport.sent[0]!.components)).toContain(s.invoiceNo);
    const inv = (await db.collection('invoices').doc(s.invoiceId).get()).data() as Invoice;
    const msg = (await db.collection('whatsappMessages').doc(inv.whatsapp.messageId!).get()).data() as WhatsAppMessage;
    expect(msg).toMatchObject({ category: 'transactional', status: 'sent', related: { type: 'invoice', id: s.invoiceId } });
    await whatsapp.recordStatus({ providerMessageId: msg.providerMessageId!, status: 'read', at: new Date().toISOString() });
    await whatsapp.recordStatus({ providerMessageId: msg.providerMessageId!, status: 'delivered', at: new Date().toISOString() }); // late, older status: ignored
    expect(((await db.collection('invoices').doc(s.invoiceId).get()).data() as Invoice).whatsapp.status).toBe('read');

    await db.collection('customers').doc(`p${phone.slice(1)}`).set({ consent: { transactional: { status: 'opted_out', at: new Date().toISOString(), source: 'whatsapp_reply' } } }, { merge: true });
    const skipped = await finishInvoice({ db, bucket, whatsapp }, s.invoiceId, { send: true });
    expect(skipped.whatsapp).toMatchObject({ status: 'skipped', error: expect.stringMatching(/opted out/) });
    expect(transport.sent).toHaveLength(1);
  });
});
