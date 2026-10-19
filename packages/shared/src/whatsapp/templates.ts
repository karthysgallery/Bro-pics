/**
 * The WhatsApp message templates the shop uses: what each is for, its Meta category, and the variables it takes.
 * This list is what the code SENDS. Whether Meta has APPROVED a template is a fact only Meta can state: it is recorded by
 * an administrator after checking WhatsApp Manager (see TemplateStatus in the Admin templates screen), never assumed here.
 *
 * Meta categories: UTILITY (order/account updates the customer expects), MARKETING (offers), AUTHENTICATION (login codes).
 */

export const META_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const;
export type MetaCategory = (typeof META_CATEGORIES)[number];

export type TemplateKey = 'otp' | 'invoice' | 'order_confirmed' | 'payment_received' | 'order_processing' | 'order_shipped' | 'order_delivered' | 'order_cancelled' | 'refund_status' | 'marketing_offer';

export interface TemplateSpec {
  key: TemplateKey;
  /** Default template name in WhatsApp Manager; an environment variable can override it per environment. */
  defaultName: string;
  envVar: string | null;
  category: MetaCategory;
  purpose: 'authentication' | 'transactional' | 'marketing';
  /** Body variables in order ({{1}}, {{2}}…). */
  variables: string[];
  intendedUse: string;
  /** Sent automatically by the order lifecycle? */
  automatic: boolean;
  /** Suggested wording to submit to Meta. Not an approved text: Meta reviews what is actually submitted. */
  suggestedBody: string;
}

export const TEMPLATE_SPECS: readonly TemplateSpec[] = [
  { key: 'otp', defaultName: 'karthys_auth_otp', envVar: 'WHATSAPP_OTP_TEMPLATE_NAME', category: 'AUTHENTICATION', purpose: 'authentication', variables: ['code'], intendedUse: 'Sign-in code (sent by the existing OTP provider, separate from everything below).', automatic: true, suggestedBody: '{{1}} is your verification code.' },
  { key: 'invoice', defaultName: 'karthys_invoice', envVar: 'WHATSAPP_TEMPLATE_INVOICE', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'invoice number', 'order number', 'amount'], intendedUse: 'The invoice PDF after a verified payment or an in-store sale (document header).', automatic: true, suggestedBody: 'Hi {{1}}, thank you for your purchase from KarthysGallery. Invoice {{2}}, order {{3}}, amount ₹{{4}}. Your invoice is attached.' },
  { key: 'order_confirmed', defaultName: 'karthys_order_confirmed', envVar: 'WHATSAPP_TEMPLATE_ORDER_CONFIRMED', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number', 'amount'], intendedUse: 'Sent once when the server has verified the payment: order confirmed and thank-you.', automatic: true, suggestedBody: 'Hi {{1}}, thank you! Your order {{2}} is confirmed. Amount paid: ₹{{3}}.' },
  { key: 'payment_received', defaultName: 'karthys_payment_received', envVar: 'WHATSAPP_TEMPLATE_PAYMENT_RECEIVED', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'amount', 'order number'], intendedUse: 'A separate payment receipt. Not sent automatically (the order confirmation already states the amount paid).', automatic: false, suggestedBody: 'Hi {{1}}, we received your payment of ₹{{2}} for order {{3}}.' },
  { key: 'order_processing', defaultName: 'karthys_order_processing', envVar: 'WHATSAPP_TEMPLATE_ORDER_PROCESSING', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number'], intendedUse: 'Sent when production starts.', automatic: true, suggestedBody: 'Hi {{1}}, we have started making your order {{2}}.' },
  { key: 'order_shipped', defaultName: 'karthys_order_shipped', envVar: 'WHATSAPP_TEMPLATE_ORDER_SHIPPED', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number', 'courier', 'tracking number', 'tracking link or instruction'], intendedUse: 'Sent when staff record the dispatch with a courier and tracking number. The link is the real tracking URL if one was saved, never invented.', automatic: true, suggestedBody: 'Hi {{1}}, your order {{2}} has been shipped with {{3}}. Tracking number: {{4}}. {{5}}' },
  { key: 'order_delivered', defaultName: 'karthys_order_delivered', envVar: 'WHATSAPP_TEMPLATE_ORDER_DELIVERED', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number'], intendedUse: 'Sent when the order is marked delivered by staff.', automatic: true, suggestedBody: 'Hi {{1}}, your order {{2}} has been delivered. If anything is wrong, please message us here.' },
  { key: 'order_cancelled', defaultName: 'karthys_order_cancelled', envVar: 'WHATSAPP_TEMPLATE_ORDER_CANCELLED', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number'], intendedUse: 'Sent when an order is cancelled.', automatic: true, suggestedBody: 'Hi {{1}}, your order {{2}} has been cancelled.' },
  { key: 'refund_status', defaultName: 'karthys_refund_status', envVar: 'WHATSAPP_TEMPLATE_REFUND_STATUS', category: 'UTILITY', purpose: 'transactional', variables: ['first name', 'order number', 'refund status'], intendedUse: 'Sent when a refund is recorded as processed.', automatic: true, suggestedBody: 'Hi {{1}}, the refund for order {{2}} is {{3}}.' },
  { key: 'marketing_offer', defaultName: 'karthys_festival_offer', envVar: null, category: 'MARKETING', purpose: 'marketing', variables: ['first name'], intendedUse: 'A festival or offer announcement, only to customers with recorded marketing permission. The offer wording is part of what Meta approves: do not state a discount, coupon or date that is not true.', automatic: false, suggestedBody: 'Hi {{1}}, happy festival season from KarthysGallery! Explore our latest photo frames at karthysgallery.in. Reply STOP to stop these messages.' },
];

export const templateSpec = (key: TemplateKey): TemplateSpec => TEMPLATE_SPECS.find((t) => t.key === key)!;

export function templateNameFor(key: TemplateKey, env: Record<string, string | undefined> = process.env): string {
  const spec = templateSpec(key);
  return (spec.envVar && env[spec.envVar]) || spec.defaultName;
}

/** The only characters allowed in a template name in WhatsApp Manager. */
export const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;

/** What the owner records about each template after checking WhatsApp Manager. Stored in Firestore (settings/whatsappTemplates). */
export const TEMPLATE_STATUSES = ['not_submitted', 'in_review', 'approved', 'rejected', 'paused'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
