import { splitGstFromInclusiveTotal } from '../pricing/gst';
import { IST_OFFSET_MS } from '../analytics/dashboard';
import {
  UNKNOWN_CONSENT,
  type BillingSettings,
  type Consent,
  type Customer,
  type Invoice,
  type InvoiceLine,
  type InvoiceParty,
  type InvoicePayment,
  type InvoiceSeller,
  type InvoiceStatus,
} from '../schemas/billing';

/**
 * The ONE invoice engine. Pure functions (no Firestore): the online-order
 * trigger and the POS sale route both build their invoice through here, so
 * both channels number, price, tax and print invoices the same way. Every
 * money value is recalculated from catalogue prices and the rules below —
 * nothing the browser sends about prices, discounts, tax or totals is trusted.
 */

// ---------------------------------------------------------------------------
// Phones and customers

/** +91XXXXXXXXXX from what staff or a customer typed; throws a readable error for anything else. */
export function normalizeIndianMobile(input: string): string {
  let cleaned = String(input ?? '').replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
  if (!/^[6-9]\d{9}$/.test(cleaned)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  return `+91${cleaned}`;
}

/** The customer record id for a mobile number: one record per number, online and in store. */
export function customerIdForPhone(e164: string): string {
  return `p${e164.replace(/\D/g, '')}`;
}

export function newCustomer(input: { phone: string; name: string; email?: string | null; userId?: string | null; source: Customer['source'] }, nowIso: string): Customer {
  return {
    id: customerIdForPhone(input.phone),
    phone: input.phone,
    name: input.name.trim(),
    email: input.email ?? null,
    userId: input.userId ?? null,
    source: input.source,
    stats: { onlineOrders: 0, posPurchases: 0, totalSpent: 0, lastPurchaseAt: null },
    consent: { transactional: { ...UNKNOWN_CONSENT }, marketing: { ...UNKNOWN_CONSENT } },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** A consent change; an opt-out always wins immediately. */
export function consent(status: Consent['status'], source: string, nowIso: string): Consent {
  return { status, at: nowIso, source };
}

// ---------------------------------------------------------------------------
// Numbering

/** Indian financial year (April–March) a moment falls in, as its starting year, in India time. */
export function financialYearOf(date: Date): number {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  return ist.getUTCMonth() >= 3 ? year : year - 1;
}

export const invoiceCounterPath = (fy: number) => `counters/invoice-FY${fy}`;
export const creditNoteCounterPath = (fy: number) => `counters/creditNote-FY${fy}`;

/** KG-INV-2026-000001: prefix, financial year, gap-free sequence. */
export function formatInvoiceNo(prefix: string, fy: number, seq: number): string {
  return `${prefix}-${fy}-${String(seq).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Pricing

export class BillingError extends Error {
  constructor(
    public readonly code: 'invalid_discount' | 'discount_over_limit' | 'payment_mismatch' | 'invalid_quantity' | 'unavailable' | 'insufficient_stock' | 'invalid',
    message: string
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface CatalogueItem {
  productId: string;
  variantId: string | null;
  title: string;
  variantLabel: string | null;
  sku: string | null;
  /** Current selling price from the catalogue (GST-inclusive paise). */
  unitPrice: number;
}

export interface RequestedLine {
  qty: number;
  /** Discount asked for on this line: a percent OR a flat amount (paise). */
  discountPercent?: number;
  discountAmount?: number;
}

/**
 * Prices one line from the catalogue. The discount is checked against the
 * staff limit unless the staff member may override it.
 */
export function priceLine(item: CatalogueItem, req: RequestedLine, rules: { maxDiscountPercent: number; canOverride: boolean }): InvoiceLine {
  if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > 999) throw new BillingError('invalid_quantity', `Quantity for ${item.title} must be a whole number from 1 to 999.`);
  const gross = item.unitPrice * req.qty;
  let discount = 0;
  if (req.discountPercent !== undefined && req.discountAmount !== undefined) throw new BillingError('invalid_discount', 'Give a discount as a percent or an amount, not both.');
  if (req.discountPercent !== undefined) {
    if (!(req.discountPercent >= 0 && req.discountPercent <= 100)) throw new BillingError('invalid_discount', 'A discount percent must be between 0 and 100.');
    discount = Math.round((gross * req.discountPercent) / 100);
  } else if (req.discountAmount !== undefined) {
    if (!Number.isInteger(req.discountAmount) || req.discountAmount < 0 || req.discountAmount > gross) throw new BillingError('invalid_discount', `The discount on ${item.title} can't be more than the line total.`);
    discount = req.discountAmount;
  }
  const percent = gross === 0 ? 0 : (discount / gross) * 100;
  if (!rules.canOverride && percent > rules.maxDiscountPercent + 1e-9) {
    throw new BillingError('discount_over_limit', `${item.title}: discounts above ${rules.maxDiscountPercent}% need a manager.`);
  }
  return { ...item, qty: req.qty, discount, lineTotal: gross - discount };
}

export interface Totals {
  subtotal: number;
  discount: number;
  total: number;
}

export function totalsOf(lines: InvoiceLine[], shipping = 0, orderDiscount = 0): Totals {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const lineDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const discount = lineDiscount + orderDiscount;
  return { subtotal, discount, total: subtotal - discount + shipping };
}

/** GST contained in a GST-inclusive total, using the shop's GST setting. */
export function taxLinesFor(total: number, gst: { enabled: boolean; rate: number }): Invoice['taxLines'] {
  if (!gst.enabled || gst.rate <= 0 || total <= 0) return [];
  const split = splitGstFromInclusiveTotal(total, gst.rate);
  return [{ rate: gst.rate, taxable: split.taxableValuePaise, amount: split.gstAmountPaise }];
}

/** Payments must add up to the total exactly (a split bill: some cash, some UPI). */
export function checkPayments(payments: InvoicePayment[], total: number, allowed: readonly string[]): void {
  if (payments.length === 0) throw new BillingError('payment_mismatch', 'Choose how the customer paid.');
  for (const p of payments) {
    if (!allowed.includes(p.method)) throw new BillingError('payment_mismatch', `“${p.method}” is not an accepted payment method.`);
    if (!Number.isInteger(p.amount) || p.amount < 0) throw new BillingError('payment_mismatch', 'Payment amounts must be in whole paise.');
  }
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (paid !== total) throw new BillingError('payment_mismatch', `Payments add up to ${formatRupees(paid)} but the bill is ${formatRupees(total)}.`);
}

export function invoiceStatusFor(total: number, refunded: number, cancelled = false): InvoiceStatus {
  if (cancelled) return 'cancelled';
  if (refunded <= 0) return 'paid';
  return refunded >= total ? 'refunded' : 'partially_refunded';
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Assembly

export function sellerFrom(settings: BillingSettings, gst: { enabled: boolean; gstin?: string | null }): InvoiceSeller {
  return {
    name: settings.businessName,
    legalName: settings.legalName || null,
    address: settings.address || null,
    phone: settings.phone || null,
    email: settings.email || null,
    gstin: gst.enabled && gst.gstin ? gst.gstin : null,
  };
}

interface InvoiceBase {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  createdBy: string;
  seller: InvoiceSeller;
  footer: string | null;
  gst: { enabled: boolean; rate: number };
}

export function buildPosInvoice(input: InvoiceBase & { saleId: string; customerId: string; customer: InvoiceParty; lines: InvoiceLine[]; payments: InvoicePayment[] }): Invoice {
  const t = totalsOf(input.lines);
  return {
    id: input.id,
    invoiceNo: input.invoiceNo,
    kind: 'invoice',
    channel: 'pos',
    orderId: null,
    orderNo: null,
    saleId: input.saleId,
    originalInvoiceId: null,
    originalInvoiceNo: null,
    customerId: input.customerId,
    customer: input.customer,
    shippingAddress: null,
    seller: input.seller,
    lines: input.lines,
    subtotal: t.subtotal,
    discount: t.discount,
    couponCode: null,
    shipping: 0,
    total: t.total,
    taxLines: taxLinesFor(t.total, input.gst),
    payments: input.payments,
    status: 'paid',
    refundedAmount: 0,
    footer: input.footer,
    pdfPath: null,
    pdfGeneratedAt: null,
    whatsapp: { status: 'not_sent', messageId: null, error: null, at: null },
    issuedAt: input.issuedAt,
    createdBy: input.createdBy,
  };
}

/** The order fields the invoice needs (orders/{id}), plus its items (orders/{id}/items). */
export interface OrderForInvoice {
  id: string;
  orderNo: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponCode?: string | null;
  customerName?: string | null;
  addressJson: Record<string, unknown>;
  razorpayPaymentId?: string | null;
  paymentProvider?: string | null;
  placedAt: string;
  items: Array<{ productId: string; variantId?: string | null; title: string; sizeLabel?: string | null; frameColour?: string | null; sku?: string | null; qty: number; unitPrice: number; finish?: string | null }>;
}

/** The address an order was shipped to, as printable lines. */
export function addressLines(a: Record<string, unknown>): string[] {
  const s = (k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string).trim() : null);
  const cityLine = [s('city'), s('state'), s('pincode')].filter(Boolean).join(', ');
  return [s('line1'), s('line2'), cityLine || null].filter((x): x is string => Boolean(x));
}

/**
 * Online order → invoice. Uses the order's own stored figures (already
 * server-priced at checkout); the order-level discount is shown as-is and the
 * total must equal the order's total, or the invoice is refused.
 */
export function buildOnlineInvoice(input: InvoiceBase & { order: OrderForInvoice; customerId: string | null; phone: string | null; email: string | null }): Invoice {
  const o = input.order;
  const lines: InvoiceLine[] = o.items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    title: i.title,
    variantLabel: [i.sizeLabel, i.frameColour, i.finish === 'glitter' ? 'Glitter finish' : null].filter(Boolean).join(' · ') || null,
    sku: i.sku ?? null,
    qty: i.qty,
    unitPrice: i.unitPrice,
    discount: 0,
    lineTotal: i.unitPrice * i.qty,
  }));
  const t = totalsOf(lines, o.shipping, o.discount);
  if (t.total !== o.total) throw new BillingError('invalid', `Order ${o.orderNo}: items add up to ${formatRupees(t.total)} but the order total is ${formatRupees(o.total)}.`);
  const address = addressLines(o.addressJson);
  const name = (typeof o.addressJson.recipientName === 'string' && o.addressJson.recipientName.trim()) || o.customerName || 'Customer';
  return {
    id: input.id,
    invoiceNo: input.invoiceNo,
    kind: 'invoice',
    channel: 'online',
    orderId: o.id,
    orderNo: o.orderNo,
    saleId: null,
    originalInvoiceId: null,
    originalInvoiceNo: null,
    customerId: input.customerId,
    customer: { name: String(name), phone: input.phone, email: input.email, address: address.length ? address : null },
    shippingAddress: address.length ? address : null,
    seller: input.seller,
    lines,
    subtotal: t.subtotal,
    discount: t.discount,
    couponCode: o.couponCode ?? null,
    shipping: o.shipping,
    total: o.total,
    taxLines: taxLinesFor(o.total, input.gst),
    payments: [{ method: 'online', amount: o.total, reference: o.razorpayPaymentId ?? (o.paymentProvider === 'mock' ? 'test payment' : null) }],
    status: 'paid',
    refundedAmount: 0,
    footer: input.footer,
    pdfPath: null,
    pdfGeneratedAt: null,
    whatsapp: { status: 'not_sent', messageId: null, error: null, at: null },
    issuedAt: input.issuedAt,
    createdBy: 'system',
  };
}

/**
 * A credit note for returned units (or a refund) against an invoice: same
 * layout, negative in meaning, positive figures. A completed invoice is never
 * edited; corrections are always a new, numbered document.
 */
export function buildCreditNote(
  input: InvoiceBase & { original: Invoice; lines: InvoiceLine[]; reason: string | null; refundMethod: InvoicePayment['method']; reference: string | null; saleId?: string | null }
): Invoice {
  const t = totalsOf(input.lines);
  return {
    ...input.original,
    id: input.id,
    invoiceNo: input.invoiceNo,
    kind: 'credit_note',
    saleId: input.saleId ?? input.original.saleId,
    originalInvoiceId: input.original.id,
    originalInvoiceNo: input.original.invoiceNo,
    seller: input.seller,
    lines: input.lines,
    subtotal: t.subtotal,
    discount: t.discount,
    couponCode: null,
    shipping: 0,
    total: t.total,
    taxLines: taxLinesFor(t.total, input.gst),
    payments: [{ method: input.refundMethod, amount: t.total, reference: input.reference }],
    status: 'refunded',
    refundedAmount: t.total,
    footer: input.reason ? `Reason: ${input.reason}` : input.footer,
    pdfPath: null,
    pdfGeneratedAt: null,
    whatsapp: { status: 'not_sent', messageId: null, error: null, at: null },
    issuedAt: input.issuedAt,
    createdBy: input.createdBy,
  };
}

/**
 * The lines being returned from an original invoice, priced pro rata from
 * what the customer actually paid for each unit (discounts included).
 */
export function returnLines(original: InvoiceLine[], returns: Array<{ lineIndex: number; qty: number }>, alreadyReturned: number[]): InvoiceLine[] {
  return returns.map((r) => {
    const line = original[r.lineIndex];
    if (!line) throw new BillingError('invalid', 'That item is not on this bill.');
    const left = line.qty - (alreadyReturned[r.lineIndex] ?? 0);
    if (!Number.isInteger(r.qty) || r.qty < 1 || r.qty > left) throw new BillingError('invalid_quantity', `${line.title}: only ${left} can still be returned.`);
    const discount = Math.round((line.discount * r.qty) / line.qty);
    return { ...line, qty: r.qty, discount, lineTotal: line.unitPrice * r.qty - discount };
  });
}
