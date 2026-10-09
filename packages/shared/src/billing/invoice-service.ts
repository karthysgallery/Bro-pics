import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  BillingError,
  buildCreditNote,
  buildOnlineInvoice,
  buildPosInvoice,
  checkPayments,
  consent,
  customerIdForPhone,
  financialYearOf,
  invoiceStatusFor,
  newCustomer,
  normalizeIndianMobile,
  priceLine,
  returnLines,
  sellerFrom,
  totalsOf,
  type CatalogueItem,
  type OrderForInvoice,
  type RequestedLine,
} from './invoice-engine';
import { renderInvoicePdf } from './invoice-pdf';
import { applyStock, readStock } from '../inventory/stock';
import { generateInvoiceNo, DEFAULT_CREDIT_NOTE_PREFIX, DEFAULT_INVOICE_PREFIX } from '../orders/invoice-number';
import type { CounterTransaction } from '../orders/order-number';
import {
  BillingSettingsSchema,
  DEFAULT_BILLING_SETTINGS,
  type BillingSettings,
  type ConsentStatus,
  type Customer,
  type Invoice,
  type InvoicePayment,
  type PaymentMethod,
  type PosSale,
} from '../schemas/billing';
import type { WhatsAppService, SendOutcome } from '../whatsapp/service';

/**
 * The invoice SERVICE: everything that touches Firestore and Storage around
 * the pure invoice engine. Online orders (functions trigger) and in-store
 * bills (POS route) both call this, so there is one numbering sequence, one
 * customer record per phone, one stock figure and one PDF/WhatsApp path.
 * Server-only — import by path.
 */

// ---------------------------------------------------------------------------
// Settings and helpers

export interface BillingContext {
  settings: BillingSettings;
  gst: { enabled: boolean; rate: number; gstin: string | null };
}

/** Reads settings/billing and settings/gst — inside a transaction when one is given. */
export async function readBillingContext(db: Firestore, tx?: Transaction): Promise<BillingContext> {
  const read = (ref: DocumentReference) => (tx ? tx.get(ref) : ref.get());
  const [billing, gst] = await Promise.all([read(db.collection('settings').doc('billing')), read(db.collection('settings').doc('gst'))]);
  const parsed = BillingSettingsSchema.safeParse({ ...DEFAULT_BILLING_SETTINGS, ...(billing.exists ? billing.data() : {}) });
  const g = (gst.exists ? gst.data() : {}) as { gstEnabled?: boolean; taxRate?: number; gstin?: string };
  return {
    settings: parsed.success ? parsed.data : DEFAULT_BILLING_SETTINGS,
    gst: { enabled: g.gstEnabled === true, rate: typeof g.taxRate === 'number' ? g.taxRate : 0, gstin: g.gstin ?? null },
  };
}

function counterAdapter(tx: Transaction, db: Firestore): CounterTransaction {
  return {
    async get(ref) {
      const snap = await tx.get(db.doc(ref.path));
      return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
    },
    set(ref, data) {
      tx.set(db.doc(ref.path), data);
    },
  };
}

function lockNumber(tx: Transaction, db: Firestore, invoiceNo: string, kind: Invoice['kind'], refs: Record<string, string>) {
  tx.create(db.collection('invoiceNumbers').doc(invoiceNo), { invoiceNo, kind, ...refs, at: new Date().toISOString() });
}

const hashId = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);

/** Writes (creates or updates) the customer for a sale, inside the sale's transaction. */
function upsertCustomerInTx(
  tx: Transaction,
  ref: DocumentReference,
  existing: Customer | null,
  input: { phone: string; name: string | null; email?: string | null; userId?: string | null; source: Customer['source']; channel: 'online' | 'pos'; amount: number; at: string; consent?: { transactional?: ConsentStatus | null; marketing?: ConsentStatus | null; source: string } }
) {
  const base = existing ?? newCustomer({ phone: input.phone, name: input.name || 'Customer', email: input.email ?? null, userId: input.userId ?? null, source: input.source }, input.at);
  const next: Customer = {
    ...base,
    name: input.name?.trim() || base.name,
    email: input.email?.trim() || base.email || null,
    userId: input.userId ?? base.userId ?? null,
    stats: {
      onlineOrders: base.stats.onlineOrders + (input.channel === 'online' ? 1 : 0),
      posPurchases: base.stats.posPurchases + (input.channel === 'pos' ? 1 : 0),
      totalSpent: base.stats.totalSpent + input.amount,
      lastPurchaseAt: input.at,
    },
    consent: {
      transactional: input.consent?.transactional ? consent(input.consent.transactional, input.consent.source, input.at) : base.consent.transactional,
      marketing: input.consent?.marketing ? consent(input.consent.marketing, input.consent.source, input.at) : base.consent.marketing,
    },
    updatedAt: input.at,
  };
  tx.set(ref, next);
  return next;
}

// ---------------------------------------------------------------------------
// Finishing: PDF in Storage, then WhatsApp

export const invoicePdfPath = (inv: Pick<Invoice, 'id' | 'issuedAt'>) => `invoices/FY${financialYearOf(new Date(inv.issuedAt))}/${inv.id}.pdf`;

/** The bit of a Cloud Storage bucket this needs (firebase-admin's bucket fits). */
export interface InvoiceBucket {
  file(path: string): { save(data: Buffer, options: { contentType: string; resumable: boolean; metadata?: Record<string, unknown> }): Promise<unknown> };
}

export interface FinishDeps {
  db: Firestore;
  bucket: InvoiceBucket;
  whatsapp: WhatsAppService | null;
}

export interface FinishResult {
  pdfPath: string | null;
  pdfError?: string;
  whatsapp: { status: Invoice['whatsapp']['status']; error: string | null };
}

/**
 * Renders the invoice PDF, stores it privately, and sends it on WhatsApp when
 * asked (and allowed by settings and consent). Safe to run again: it is how
 * "regenerate" and "resend" work too. Never throws for a WhatsApp problem —
 * that is recorded on the invoice and in the message log.
 */
export async function finishInvoice(deps: FinishDeps, invoiceId: string, options: { send: boolean }): Promise<FinishResult> {
  const ref = deps.db.collection('invoices').doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError('invalid', 'Invoice not found.');
  const invoice = snap.data() as Invoice;

  let pdf: Uint8Array | null = null;
  let pdfPath: string | null = invoice.pdfPath;
  let pdfError: string | undefined;
  try {
    pdf = await renderInvoicePdf(invoice);
    pdfPath = invoicePdfPath(invoice);
    await deps.bucket.file(pdfPath).save(Buffer.from(pdf), { contentType: 'application/pdf', resumable: false, metadata: { contentDisposition: `inline; filename="${invoice.invoiceNo}.pdf"` } });
    await ref.update({ pdfPath, pdfGeneratedAt: new Date().toISOString() });
  } catch (err) {
    pdfError = err instanceof Error ? err.message : String(err);
  }

  let whatsapp: FinishResult['whatsapp'] = { status: invoice.whatsapp.status, error: invoice.whatsapp.error };
  if (options.send) {
    const ctx = await readBillingContext(deps.db);
    let outcome: SendOutcome;
    if (!ctx.settings.whatsappInvoices) outcome = { status: 'skipped', reason: 'WhatsApp invoices are switched off in Billing settings.' };
    else if (!deps.whatsapp) outcome = { status: 'skipped', reason: 'WhatsApp is not available.' };
    else if (!pdf) outcome = { status: 'failed', messageId: null, error: `The PDF could not be made: ${pdfError}` };
    else {
      const customer = invoice.customerId ? ((await deps.db.collection('customers').doc(invoice.customerId).get()).data() as Customer | undefined) ?? null : null;
      outcome = await deps.whatsapp.sendInvoice({ invoice, pdf, customer });
    }
    const at = new Date().toISOString();
    const status = outcome.status === 'sent' ? 'sent' : outcome.status === 'skipped' ? 'skipped' : 'failed';
    const error = outcome.status === 'failed' ? outcome.error : outcome.status === 'skipped' ? outcome.reason : null;
    await ref.update({ whatsapp: { status, messageId: outcome.status === 'skipped' ? null : outcome.messageId, error, at } });
    whatsapp = { status, error };
  }
  return { pdfPath, ...(pdfError && { pdfError }), whatsapp };
}

// ---------------------------------------------------------------------------
// Online orders

/**
 * Online order → invoice, once. Called when an order's payment is confirmed
 * (its invoice number was assigned in the payment transaction). Idempotent:
 * the invoice id is `order_{orderId}` and is created with create(), so a
 * retried trigger or webhook returns the existing invoice instead of a copy.
 */
export async function createOnlineInvoice(db: Firestore, orderId: string): Promise<{ invoiceId: string; created: boolean } | null> {
  const invoiceId = `order_${orderId}`;
  return db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc(orderId);
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    const [orderSnap, invoiceSnap] = await Promise.all([tx.get(orderRef), tx.get(invoiceRef)]);
    if (invoiceSnap.exists) return { invoiceId, created: false };
    if (!orderSnap.exists) return null;
    const order = orderSnap.data() as Record<string, unknown> & { orderNo: string; invoiceNo?: string; paymentStatus?: string; userId: string; placedAt?: { toDate?: () => Date } | Date | string };
    if (!order.invoiceNo || order.paymentStatus !== 'paid') return null;

    const itemsSnap = await tx.get(orderRef.collection('items'));
    const userSnap = await tx.get(db.collection('users').doc(order.userId));
    const user = userSnap.exists ? (userSnap.data() as { phone?: string; email?: string | null; displayName?: string | null }) : {};
    const address = (order.addressJson ?? {}) as Record<string, unknown>;
    let phone: string | null = null;
    for (const candidate of [user.phone, address.phone]) {
      try {
        if (typeof candidate === 'string') {
          phone = normalizeIndianMobile(candidate);
          break;
        }
      } catch {
        // not an Indian mobile; try the next one
      }
    }
    const customerRef = phone ? db.collection('customers').doc(customerIdForPhone(phone)) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    const ctx = await readBillingContext(db, tx);

    const placed = order.placedAt instanceof Date ? order.placedAt : typeof order.placedAt === 'string' ? new Date(order.placedAt) : order.placedAt?.toDate?.() ?? new Date();
    const forInvoice: OrderForInvoice = {
      id: orderId,
      orderNo: order.orderNo,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      shipping: Number(order.shipping),
      total: Number(order.total),
      couponCode: typeof order.couponId === 'string' ? order.couponId : null,
      customerName: typeof order.customerName === 'string' ? order.customerName : user.displayName ?? null,
      addressJson: address,
      razorpayPaymentId: typeof order.razorpayPaymentId === 'string' ? order.razorpayPaymentId : null,
      paymentProvider: typeof order.paymentProvider === 'string' ? order.paymentProvider : null,
      placedAt: placed.toISOString(),
      items: itemsSnap.docs.map((d) => {
        const i = d.data() as { productId: string; variantId?: string; title: string; sizeLabel?: string; frameColour?: string; sku?: string; qty: number; unitPrice: number };
        return { productId: i.productId, variantId: i.variantId ?? null, title: i.title, sizeLabel: i.sizeLabel ?? null, frameColour: i.frameColour ?? null, sku: i.sku ?? null, qty: i.qty, unitPrice: i.unitPrice };
      }),
    };
    const issuedAt = new Date().toISOString();
    const invoice = buildOnlineInvoice({
      id: invoiceId,
      invoiceNo: order.invoiceNo,
      issuedAt,
      createdBy: 'system',
      seller: sellerFrom(ctx.settings, ctx.gst),
      footer: ctx.settings.footer ?? null,
      gst: ctx.gst,
      order: forInvoice,
      customerId: customerRef?.id ?? null,
      phone,
      email: user.email ?? null,
    });
    tx.create(invoiceRef, invoice);
    if (customerRef && phone) {
      upsertCustomerInTx(tx, customerRef, customerSnap?.exists ? (customerSnap.data() as Customer) : null, {
        phone,
        name: invoice.customer.name,
        email: user.email ?? null,
        userId: order.userId,
        source: 'online',
        channel: 'online',
        amount: invoice.total,
        at: issuedAt,
      });
    }
    return { invoiceId, created: true };
  });
}

/**
 * An online refund (orders/{id}/refunds, already processed) → a credit note
 * against the order's invoice, and the invoice's refunded/status figures.
 * Idempotent by refund id.
 */
export async function recordOnlineRefund(db: Firestore, input: { orderId: string; refundId: string; amount: number; reason: string | null; reference: string | null }): Promise<{ creditNoteId: string; created: boolean } | null> {
  const creditNoteId = `cn_refund_${input.refundId}`;
  return db.runTransaction(async (tx) => {
    const invRef = db.collection('invoices').doc(`order_${input.orderId}`);
    const cnRef = db.collection('invoices').doc(creditNoteId);
    const [invSnap, cnSnap] = await Promise.all([tx.get(invRef), tx.get(cnRef)]);
    if (cnSnap.exists) return { creditNoteId, created: false };
    if (!invSnap.exists) return null;
    const original = invSnap.data() as Invoice;
    const ctx = await readBillingContext(db, tx);
    const now = new Date();
    const invoiceNo = await generateInvoiceNo(counterAdapter(tx, db), now, ctx.settings.creditNotePrefix || DEFAULT_CREDIT_NOTE_PREFIX, 'credit_note');
    const amount = Math.min(input.amount, original.total - original.refundedAmount);
    if (amount <= 0) throw new BillingError('invalid', 'This order has already been refunded in full.');
    const line = { productId: 'refund', variantId: null, title: `Refund against order ${original.orderNo}`, variantLabel: input.reason, sku: null, qty: 1, unitPrice: amount, discount: 0, lineTotal: amount };
    const cn = buildCreditNote({ id: creditNoteId, invoiceNo, issuedAt: now.toISOString(), createdBy: 'system', seller: sellerFrom(ctx.settings, ctx.gst), footer: ctx.settings.footer ?? null, gst: ctx.gst, original, lines: [line], reason: input.reason, refundMethod: 'online', reference: input.reference });
    lockNumber(tx, db, invoiceNo, 'credit_note', { orderId: input.orderId, refundId: input.refundId });
    tx.create(cnRef, cn);
    const refunded = original.refundedAmount + amount;
    tx.update(invRef, { refundedAmount: refunded, status: invoiceStatusFor(original.total, refunded) });
    if (original.customerId) tx.set(db.collection('customers').doc(original.customerId), { stats: { totalSpent: FieldValue.increment(-amount) }, updatedAt: now.toISOString() }, { merge: true });
    return { creditNoteId, created: true };
  });
}

// ---------------------------------------------------------------------------
// In-store (POS)

export interface PosSaleInput {
  staffUid: string;
  canOverrideDiscount: boolean;
  /** Generated by the till for this bill; a double-click or retry returns the same sale. */
  clientRequestId: string;
  customer: { phone: string; name: string; email?: string | null };
  lines: Array<{ productId: string; variantId: string } & RequestedLine>;
  payments: Array<{ method: PaymentMethod; amount: number; reference?: string | null }>;
  consent: { transactional: ConsentStatus | null; marketing: ConsentStatus | null };
}

export interface PosSaleResult {
  saleId: string;
  invoiceId: string;
  invoiceNo: string;
  total: number;
  discount: number;
  /** False when this request repeated an already-completed bill. */
  created: boolean;
}

/** Catalogue prices and labels, read on the server (never from the till). */
export async function loadCatalogueItems(db: Firestore, lines: Array<{ productId: string; variantId: string }>): Promise<Map<string, CatalogueItem>> {
  const out = new Map<string, CatalogueItem>();
  await Promise.all(
    [...new Map(lines.map((l) => [`${l.productId}/${l.variantId}`, l])).values()].map(async (l) => {
      const [p, v] = await Promise.all([db.collection('products').doc(l.productId).get(), db.collection('products').doc(l.productId).collection('variants').doc(l.variantId).get()]);
      const product = p.data() as { title?: string; isActive?: boolean; status?: string } | undefined;
      const variant = v.data() as { price?: number; isActive?: boolean; sku?: string; sizeLabel?: string; frameColour?: string } | undefined;
      if (!product || !variant || product.isActive === false || product.status === 'archived' || variant.isActive === false || !Number.isInteger(variant.price)) {
        throw new BillingError('unavailable', `${product?.title ?? 'An item'} is not available for sale.`);
      }
      out.set(`${l.productId}/${l.variantId}`, {
        productId: l.productId,
        variantId: l.variantId,
        title: product.title ?? 'Item',
        variantLabel: [variant.sizeLabel, variant.frameColour].filter(Boolean).join(' · ') || null,
        sku: variant.sku ?? null,
        unitPrice: variant.price!,
      });
    })
  );
  return out;
}

export async function createPosSale(db: Firestore, input: PosSaleInput): Promise<PosSaleResult> {
  const phone = normalizeIndianMobile(input.customer.phone);
  const name = input.customer.name.trim();
  if (!name) throw new BillingError('invalid', "Enter the customer's name.");
  if (input.lines.length === 0) throw new BillingError('invalid', 'Add at least one item.');

  const ctx = await readBillingContext(db);
  const catalogue = await loadCatalogueItems(db, input.lines);
  const lines = input.lines.map((l) => priceLine(catalogue.get(`${l.productId}/${l.variantId}`)!, l, { maxDiscountPercent: ctx.settings.maxStaffDiscountPercent, canOverride: input.canOverrideDiscount }));
  const totals = totalsOf(lines);
  const payments: InvoicePayment[] = input.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference?.trim() || null }));
  checkPayments(payments, totals.total, ctx.settings.paymentMethods);

  const saleId = `s${hashId(input.staffUid, input.clientRequestId)}`;
  const invoiceId = `pos_${saleId}`;
  return db.runTransaction(async (tx) => {
    const saleRef = db.collection('posSales').doc(saleId);
    const existing = await tx.get(saleRef);
    if (existing.exists) {
      const s = existing.data() as PosSale;
      return { saleId, invoiceId: s.invoiceId, invoiceNo: s.invoiceNo, total: s.total, discount: s.discount, created: false };
    }
    const stock = await readStock(tx, db, lines.map((l) => ({ productId: l.productId, variantId: l.variantId! })));
    const customerRef = db.collection('customers').doc(customerIdForPhone(phone));
    const customerSnap = await tx.get(customerRef);
    const txCtx = await readBillingContext(db, tx);
    const now = new Date();
    const invoiceNo = await generateInvoiceNo(counterAdapter(tx, db), now, txCtx.settings.invoicePrefix || DEFAULT_INVOICE_PREFIX);
    const at = now.toISOString();

    // Writes (all reads are done).
    applyStock(tx, db, stock, lines.map((l) => ({ productId: l.productId, variantId: l.variantId!, delta: -l.qty, label: l.title })), { reason: 'OFFLINE_POS', ref: { type: 'pos_sale', id: saleId }, by: input.staffUid, at });
    const customer = upsertCustomerInTx(tx, customerRef, customerSnap.exists ? (customerSnap.data() as Customer) : null, {
      phone,
      name,
      email: input.customer.email ?? null,
      source: 'pos',
      channel: 'pos',
      amount: totals.total,
      at,
      consent: { transactional: input.consent.transactional, marketing: input.consent.marketing, source: 'pos' },
    });
    const invoice = buildPosInvoice({
      id: invoiceId,
      invoiceNo,
      issuedAt: at,
      createdBy: input.staffUid,
      seller: sellerFrom(txCtx.settings, txCtx.gst),
      footer: txCtx.settings.footer ?? null,
      gst: txCtx.gst,
      saleId,
      customerId: customer.id,
      customer: { name: customer.name, phone, email: customer.email ?? null, address: null },
      lines,
      payments,
    });
    lockNumber(tx, db, invoiceNo, 'invoice', { saleId });
    tx.create(db.collection('invoices').doc(invoiceId), invoice);
    const sale: PosSale = { id: saleId, invoiceId, invoiceNo, customerId: customer.id, lines, subtotal: totals.subtotal, discount: totals.discount, total: totals.total, payments, returnedQty: lines.map(() => 0), refundedAmount: 0, status: 'completed', staffUid: input.staffUid, createdAt: at };
    tx.create(saleRef, sale);
    return { saleId, invoiceId, invoiceNo, total: totals.total, discount: totals.discount, created: true };
  });
}

export interface PosReturnInput {
  saleId: string;
  staffUid: string;
  clientRequestId: string;
  items: Array<{ lineIndex: number; qty: number }>;
  refundMethod: PaymentMethod;
  reference?: string | null;
  reason: string | null;
  /** Put the units back on the shelf (false for damaged goods). */
  restock: boolean;
}

/**
 * A full or partial in-store return: a numbered credit note, the units back
 * in stock (when restocked), and the sale, invoice and customer figures
 * updated — all in one transaction. The original invoice is never edited
 * beyond its refunded amount and status.
 */
export async function createPosReturn(db: Firestore, input: PosReturnInput): Promise<{ creditNoteId: string; creditNoteNo: string; amount: number; created: boolean }> {
  const returnId = `r${hashId(input.staffUid, input.saleId, input.clientRequestId)}`;
  const creditNoteId = `cn_${returnId}`;
  return db.runTransaction(async (tx) => {
    const saleRef = db.collection('posSales').doc(input.saleId);
    const cnRef = db.collection('invoices').doc(creditNoteId);
    const [saleSnap, cnSnap] = await Promise.all([tx.get(saleRef), tx.get(cnRef)]);
    if (cnSnap.exists) {
      const cn = cnSnap.data() as Invoice;
      return { creditNoteId, creditNoteNo: cn.invoiceNo, amount: cn.total, created: false };
    }
    if (!saleSnap.exists) throw new BillingError('invalid', 'That bill was not found.');
    const sale = saleSnap.data() as PosSale;
    const invRef = db.collection('invoices').doc(sale.invoiceId);
    const invSnap = await tx.get(invRef);
    const original = invSnap.data() as Invoice;
    const lines = returnLines(sale.lines, input.items, sale.returnedQty);
    const stock = input.restock ? await readStock(tx, db, lines.map((l) => ({ productId: l.productId, variantId: l.variantId! }))) : null;
    const ctx = await readBillingContext(db, tx);
    if (!ctx.settings.paymentMethods.includes(input.refundMethod)) throw new BillingError('payment_mismatch', `“${input.refundMethod}” is not an accepted payment method.`);
    const now = new Date();
    const creditNoteNo = await generateInvoiceNo(counterAdapter(tx, db), now, ctx.settings.creditNotePrefix || DEFAULT_CREDIT_NOTE_PREFIX, 'credit_note');
    const at = now.toISOString();
    const cn = buildCreditNote({ id: creditNoteId, invoiceNo: creditNoteNo, issuedAt: at, createdBy: input.staffUid, seller: sellerFrom(ctx.settings, ctx.gst), footer: ctx.settings.footer ?? null, gst: ctx.gst, original, lines, reason: input.reason, refundMethod: input.refundMethod, reference: input.reference ?? null, saleId: sale.id });

    if (stock) applyStock(tx, db, stock, lines.map((l) => ({ productId: l.productId, variantId: l.variantId!, delta: l.qty })), { reason: 'RETURN', ref: { type: 'pos_return', id: returnId }, by: input.staffUid, note: input.reason, at });
    lockNumber(tx, db, creditNoteNo, 'credit_note', { saleId: sale.id });
    tx.create(cnRef, cn);
    const returnedQty = sale.returnedQty.map((q, i) => q + input.items.filter((r) => r.lineIndex === i).reduce((s, r) => s + r.qty, 0));
    const refunded = sale.refundedAmount + cn.total;
    const all = returnedQty.every((q, i) => q >= sale.lines[i]!.qty);
    tx.update(saleRef, { returnedQty, refundedAmount: refunded, status: all ? 'returned' : 'partially_returned' });
    tx.update(invRef, { refundedAmount: refunded, status: invoiceStatusFor(original.total, refunded) });
    tx.create(saleRef.collection('returns').doc(returnId), { id: returnId, creditNoteId, creditNoteNo, items: input.items, amount: cn.total, refundMethod: input.refundMethod, reason: input.reason, restocked: input.restock, by: input.staffUid, at });
    tx.set(db.collection('customers').doc(sale.customerId), { stats: { totalSpent: FieldValue.increment(-cn.total) }, updatedAt: at }, { merge: true });
    return { creditNoteId, creditNoteNo, amount: cn.total, created: true };
  });
}
