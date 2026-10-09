import { z } from 'zod';

/**
 * Billing / POS data model. ONE invoice model for online orders and in-store
 * (POS) sales; ONE customer record per mobile number; ONE stock figure per
 * variant (shared by the website and the store). Money is integer paise,
 * like the rest of the project; prices are GST-inclusive (B2C convention).
 *
 * Firestore layout
 *   invoices/{id}                 online: `order_{orderId}`, POS: `pos_{saleId}`, credit notes: `cn_{…}`
 *   invoiceNumbers/{invoiceNo}    uniqueness lock, created in the same transaction as the invoice
 *   posSales/{id}                 an in-store sale (the transaction), with returns in posSales/{id}/returns
 *   customers/{id}                `p{digits}` from the E.164 mobile number, e.g. p919876543210
 *   inventoryMovements/{id}       every stock change with its reason and source
 *   whatsappMessages/{id}         every WhatsApp message (OTP / transactional / marketing) and its status
 *   whatsappCampaigns/{id}        marketing campaigns, recipients in …/recipients/{customerId}
 *   counters/invoice-FY{yyyy}     gap-free invoice sequence per Indian financial year
 *   counters/creditNote-FY{yyyy}  credit-note sequence
 *   settings/billing              invoice identity, prefix, footer, payment methods, WhatsApp switch
 */

// ---------------------------------------------------------------------------
// Settings

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'other'] as const;
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const BillingSettingsSchema = z
  .object({
    /** Printed on every invoice. Empty fields are simply left off. */
    businessName: z.string().min(1).max(120),
    legalName: z.string().max(160).optional(),
    address: z.string().max(400).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(120).optional().or(z.literal('')),
    /** Letters, digits and dashes; the year and sequence are added automatically. */
    invoicePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/, 'Use capital letters, digits and dashes (max 12)'),
    creditNotePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/, 'Use capital letters, digits and dashes (max 12)'),
    footer: z.string().max(400).optional(),
    paymentMethods: z.array(PaymentMethodSchema).min(1),
    /** Largest discount (percent of a line) staff may give without the override permission. */
    maxStaffDiscountPercent: z.number().min(0).max(100),
    whatsappInvoices: z.boolean(),
  })
  .strict();
export type BillingSettings = z.infer<typeof BillingSettingsSchema>;

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  businessName: 'Karthys Gallery',
  invoicePrefix: 'KG-INV',
  creditNotePrefix: 'KG-CN',
  paymentMethods: ['cash', 'upi', 'card'],
  maxStaffDiscountPercent: 10,
  whatsappInvoices: true,
};

// ---------------------------------------------------------------------------
// Customers and consent

export const ConsentStatusSchema = z.enum(['opted_in', 'opted_out', 'unknown']);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export const ConsentSchema = z.object({
  status: ConsentStatusSchema,
  /** ISO time the status was recorded. */
  at: z.string().nullable(),
  /** Where it came from: pos (staff asked), checkout, whatsapp_reply (STOP), admin, signup… */
  source: z.string().nullable(),
});
export type Consent = z.infer<typeof ConsentSchema>;
export const UNKNOWN_CONSENT: Consent = { status: 'unknown', at: null, source: null };

export const CustomerSchema = z.object({
  id: z.string(),
  /** E.164, e.g. +919876543210 — the identity that links online and in-store. */
  phone: z.string().regex(/^\+\d{8,15}$/),
  name: z.string().min(1).max(120),
  email: z.string().email().nullable().optional(),
  /** Website account, when the customer has one (users/{uid}). */
  userId: z.string().nullable().optional(),
  source: z.enum(['online', 'pos', 'admin']),
  stats: z.object({
    onlineOrders: z.number().int().nonnegative(),
    posPurchases: z.number().int().nonnegative(),
    totalSpent: z.number().int().nonnegative(),
    lastPurchaseAt: z.string().nullable(),
  }),
  consent: z.object({
    /** Order/invoice messages. */
    transactional: ConsentSchema,
    /** Offers and campaigns — only ever sent when opted_in. */
    marketing: ConsentSchema,
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof CustomerSchema>;

// ---------------------------------------------------------------------------
// Invoices

export const InvoiceLineSchema = z.object({
  productId: z.string(),
  variantId: z.string().nullable(),
  title: z.string(),
  /** "12x18 in · Black" */
  variantLabel: z.string().nullable(),
  sku: z.string().nullable(),
  qty: z.number().int().positive(),
  /** GST-inclusive price of one unit, paise. */
  unitPrice: z.number().int().nonnegative(),
  /** Discount on the whole line, paise. */
  discount: z.number().int().nonnegative(),
  /** qty × unitPrice − discount, paise. */
  lineTotal: z.number().int().nonnegative(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoicePartySchema = z.object({
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  /** Printed address lines. */
  address: z.array(z.string()).nullable(),
});
export type InvoiceParty = z.infer<typeof InvoicePartySchema>;

export const InvoiceSellerSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
});
export type InvoiceSeller = z.infer<typeof InvoiceSellerSchema>;

export const InvoicePaymentSchema = z.object({
  method: z.union([PaymentMethodSchema, z.literal('online')]),
  amount: z.number().int().nonnegative(),
  /** UPI/card reference, Razorpay payment id… */
  reference: z.string().nullable(),
});
export type InvoicePayment = z.infer<typeof InvoicePaymentSchema>;

export const INVOICE_STATUSES = ['paid', 'pending', 'refunded', 'partially_refunded', 'cancelled'] as const;
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const WHATSAPP_DELIVERY_STATUSES = ['not_sent', 'skipped', 'queued', 'sent', 'delivered', 'read', 'failed'] as const;
export const WhatsAppDeliveryStatusSchema = z.enum(WHATSAPP_DELIVERY_STATUSES);
export type WhatsAppDeliveryStatus = z.infer<typeof WhatsAppDeliveryStatusSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  kind: z.enum(['invoice', 'credit_note']),
  channel: z.enum(['online', 'pos']),
  orderId: z.string().nullable(),
  orderNo: z.string().nullable(),
  saleId: z.string().nullable(),
  /** For a credit note: the invoice it corrects. */
  originalInvoiceId: z.string().nullable(),
  originalInvoiceNo: z.string().nullable(),
  customerId: z.string().nullable(),
  customer: InvoicePartySchema,
  shippingAddress: z.array(z.string()).nullable(),
  seller: InvoiceSellerSchema,
  lines: z.array(InvoiceLineSchema).min(1),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  couponCode: z.string().nullable(),
  shipping: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** GST contained in the (inclusive) total, by rate. */
  taxLines: z.array(z.object({ rate: z.number().nonnegative(), taxable: z.number().int().nonnegative(), amount: z.number().int().nonnegative() })),
  payments: z.array(InvoicePaymentSchema),
  status: InvoiceStatusSchema,
  refundedAmount: z.number().int().nonnegative(),
  footer: z.string().nullable(),
  pdfPath: z.string().nullable(),
  pdfGeneratedAt: z.string().nullable(),
  whatsapp: z.object({
    status: WhatsAppDeliveryStatusSchema,
    messageId: z.string().nullable(),
    error: z.string().nullable(),
    at: z.string().nullable(),
  }),
  /** ISO, the legal invoice date. */
  issuedAt: z.string(),
  /** Staff uid, or 'system' for automatic online invoices. */
  createdBy: z.string(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// ---------------------------------------------------------------------------
// In-store sales

export const PosSaleSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNo: z.string(),
  customerId: z.string(),
  lines: z.array(InvoiceLineSchema).min(1),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  payments: z.array(InvoicePaymentSchema).min(1),
  /** Units returned so far, per line index. */
  returnedQty: z.array(z.number().int().nonnegative()),
  refundedAmount: z.number().int().nonnegative(),
  status: z.enum(['completed', 'partially_returned', 'returned']),
  staffUid: z.string(),
  createdAt: z.string(),
});
export type PosSale = z.infer<typeof PosSaleSchema>;

// ---------------------------------------------------------------------------
// Inventory

export const STOCK_REASONS = ['ONLINE_ORDER', 'ONLINE_RELEASE', 'OFFLINE_POS', 'RETURN', 'MANUAL_ADJUSTMENT', 'RESTOCK'] as const;
export const StockReasonSchema = z.enum(STOCK_REASONS);
export type StockReason = z.infer<typeof StockReasonSchema>;

export const InventoryMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  /** Change in units (negative = out). */
  delta: z.number().int(),
  before: z.number().int(),
  after: z.number().int(),
  reason: StockReasonSchema,
  /** What caused it: an order, a POS sale, a return, or a staff adjustment. */
  ref: z.object({ type: z.enum(['order', 'pos_sale', 'pos_return', 'adjustment']), id: z.string() }),
  note: z.string().nullable(),
  by: z.string(),
  at: z.string(),
});
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

// ---------------------------------------------------------------------------
// WhatsApp

export const WHATSAPP_CATEGORIES = ['otp', 'transactional', 'marketing'] as const;
export const WhatsAppCategorySchema = z.enum(WHATSAPP_CATEGORIES);
export type WhatsAppCategory = z.infer<typeof WhatsAppCategorySchema>;

export const WhatsAppMessageSchema = z.object({
  id: z.string(),
  category: WhatsAppCategorySchema,
  /** Approved template name, e.g. karthys_invoice. */
  template: z.string(),
  to: z.string(),
  customerId: z.string().nullable(),
  /** What it is about: an invoice, an order, a campaign, a login. */
  related: z.object({ type: z.string(), id: z.string() }).nullable(),
  status: z.enum(['queued', 'sent', 'delivered', 'read', 'failed']),
  providerMessageId: z.string().nullable(),
  error: z.string().nullable(),
  /** 'mock' messages are logged but never leave the server. */
  provider: z.enum(['cloud', 'mock']),
  createdAt: z.string(),
  updatedAt: z.string(),
  statusHistory: z.array(z.object({ status: z.string(), at: z.string() })),
});
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;

export const CampaignAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_opted_in') }),
  z.object({ type: z.literal('previous_customers') }),
  z.object({ type: z.literal('purchased_category'), categoryId: z.string().min(1) }),
  z.object({ type: z.literal('purchased_within_days'), days: z.union([z.literal(30), z.literal(60), z.literal(90)]) }),
  z.object({ type: z.literal('high_value'), minSpent: z.number().int().positive() }),
  z.object({ type: z.literal('lapsed'), days: z.number().int().positive() }),
]);
export type CampaignAudience = z.infer<typeof CampaignAudienceSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  /** An approved MARKETING template in WhatsApp Manager. */
  template: z.string().regex(/^[a-z0-9_]{1,100}$/),
  language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
  /** Body parameters in order; "{{name}}" is replaced with the customer's first name. */
  bodyParams: z.array(z.string().max(200)).max(10),
  /** The approved text, for the preview only (WhatsApp sends its own copy). */
  previewText: z.string().max(1024),
  audience: CampaignAudienceSchema,
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']),
  scheduledAt: z.string().nullable(),
  counts: z.object({
    targeted: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    read: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    optedOut: z.number().int().nonnegative(),
  }),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sentAt: z.string().nullable(),
});
export type Campaign = z.infer<typeof CampaignSchema>;
