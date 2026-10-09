import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Customer, Invoice, WhatsAppCategory, WhatsAppMessage } from '../schemas/billing';

/**
 * ONE WhatsApp Business integration for the whole shop, with three
 * deliberately separate kinds of message:
 *
 *   otp            sign-in codes (sent by the existing OTP provider; logged here, never the code itself)
 *   transactional  invoices, order / payment / shipping updates — never to someone who opted out
 *   marketing      campaigns — ONLY to customers with a recorded marketing opt-in
 *
 * Only approved templates are sent (WhatsApp's own rule for business-initiated
 * messages). Credentials are server-side env vars; the browser never sees
 * them. The transport can be swapped (Meta Cloud API today, another BSP
 * later) without touching billing or campaigns. Every message is logged in
 * whatsappMessages with its status, and the delivery webhook updates it.
 *
 * Server-only (firebase-admin): import by path, not from the shared barrel.
 */

// ---------------------------------------------------------------------------
// Transport

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: string;
  parameters: Array<Record<string, unknown>>;
}

export interface WhatsAppTransport {
  readonly mode: 'cloud' | 'mock' | 'disabled';
  sendTemplate(input: { to: string; template: string; language: string; components: TemplateComponent[] }): Promise<{ providerMessageId: string }>;
  /** Uploads a document to WhatsApp and returns its media id (so the PDF never needs a public link). */
  uploadDocument(input: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<string>;
}

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super('WhatsApp is not configured on the server (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');
    this.name = 'WhatsAppNotConfiguredError';
  }
}

const GRAPH = 'https://graph.facebook.com/v21.0';

export class CloudTransport implements WhatsAppTransport {
  readonly mode = 'cloud' as const;
  constructor(
    private readonly creds: { accessToken: string; phoneNumberId: string },
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async sendTemplate(input: { to: string; template: string; language: string; components: TemplateComponent[] }) {
    const res = await this.fetchImpl(`${GRAPH}/${this.creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to.replace(/^\+/, ''),
        type: 'template',
        template: { name: input.template, language: { code: input.language }, components: input.components },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
    if (!res.ok || !body.messages?.[0]?.id) throw new Error(`WhatsApp: ${body.error?.message ?? `HTTP ${res.status}`}${body.error?.code ? ` (code ${body.error.code})` : ''}`);
    return { providerMessageId: body.messages[0].id };
  }

  async uploadDocument(input: { bytes: Uint8Array; filename: string; mimeType: string }) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mimeType);
    form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.filename);
    const res = await this.fetchImpl(`${GRAPH}/${this.creds.phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${this.creds.accessToken}` }, body: form });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !body.id) throw new Error(`WhatsApp media upload: ${body.error?.message ?? `HTTP ${res.status}`}`);
    return body.id;
  }
}

/** Logs instead of sending: development, tests, and any environment not yet connected. */
export class MockTransport implements WhatsAppTransport {
  readonly mode = 'mock' as const;
  readonly sent: Array<{ to: string; template: string; components: TemplateComponent[] }> = [];
  async sendTemplate(input: { to: string; template: string; language: string; components: TemplateComponent[] }) {
    this.sent.push({ to: input.to, template: input.template, components: input.components });
    return { providerMessageId: `mock-${randomUUID()}` };
  }
  async uploadDocument() {
    return `mock-media-${randomUUID()}`;
  }
}

/** Production without credentials: every send fails loudly in the log, nothing pretends to work. */
export class DisabledTransport implements WhatsAppTransport {
  readonly mode = 'disabled' as const;
  async sendTemplate(): Promise<{ providerMessageId: string }> {
    throw new WhatsAppNotConfiguredError();
  }
  async uploadDocument(): Promise<string> {
    throw new WhatsAppNotConfiguredError();
  }
}

/**
 * WHATSAPP_MODE=cloud|mock. Unset: cloud when the OTP is in production mode
 * and credentials exist; mock outside production; otherwise disabled.
 */
export function transportFromEnv(env: Record<string, string | undefined> = process.env): WhatsAppTransport {
  const mode = (env.WHATSAPP_MODE ?? '').trim().toLowerCase();
  const creds = env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? { accessToken: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID } : null;
  if (mode === 'mock') return new MockTransport();
  if (mode === 'cloud' || (mode === '' && ['production', 'cloud'].includes((env.WHATSAPP_OTP_MODE ?? '').toLowerCase()))) return creds ? new CloudTransport(creds) : new DisabledTransport();
  if (mode === '' && env.NODE_ENV !== 'production') return new MockTransport();
  return new DisabledTransport();
}

/** Approved template names (WhatsApp Manager). Overridable per environment. */
export function templateNames(env: Record<string, string | undefined> = process.env) {
  return {
    language: env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
    otp: env.WHATSAPP_OTP_TEMPLATE_NAME || 'karthys_auth_otp',
    invoice: env.WHATSAPP_TEMPLATE_INVOICE || 'karthys_invoice',
    orderConfirmation: env.WHATSAPP_TEMPLATE_ORDER_CONFIRMED || 'karthys_order_confirmed',
    paymentConfirmation: env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED || 'karthys_payment_received',
    shippingUpdate: env.WHATSAPP_TEMPLATE_ORDER_SHIPPED || 'karthys_order_shipped',
  };
}

// ---------------------------------------------------------------------------
// Service

export type SendOutcome =
  | { status: 'sent'; messageId: string; providerMessageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; messageId: string | null; error: string };

const STATUS_RANK: Record<WhatsAppMessage['status'], number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const text = (t: string) => ({ type: 'text', text: t.slice(0, 1024) });
const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface WhatsAppServiceDeps {
  db: Firestore;
  transport: WhatsAppTransport;
  templates?: ReturnType<typeof templateNames>;
  now?: () => Date;
}

export function createWhatsAppService(deps: WhatsAppServiceDeps) {
  const { db, transport } = deps;
  const T = deps.templates ?? templateNames();
  const now = () => (deps.now ?? (() => new Date()))().toISOString();

  async function log(input: { category: WhatsAppCategory; template: string; to: string; customerId: string | null; related: WhatsAppMessage['related'] }): Promise<string> {
    const ref = db.collection('whatsappMessages').doc();
    const at = now();
    const msg: WhatsAppMessage = { id: ref.id, ...input, status: 'queued', providerMessageId: null, error: null, provider: transport.mode === 'cloud' ? 'cloud' : 'mock', createdAt: at, updatedAt: at, statusHistory: [{ status: 'queued', at }] };
    await ref.set(msg);
    return ref.id;
  }

  async function send(input: { category: WhatsAppCategory; template: string; to: string; customerId: string | null; related: WhatsAppMessage['related']; components: () => Promise<TemplateComponent[]> }): Promise<SendOutcome> {
    const { components: _build, ...logged } = input;
    const messageId = await log(logged);
    const ref = db.collection('whatsappMessages').doc(messageId);
    try {
      const components = await input.components();
      const { providerMessageId } = await transport.sendTemplate({ to: input.to, template: input.template, language: T.language, components });
      const at = now();
      await ref.update({ status: 'sent', providerMessageId, updatedAt: at, statusHistory: FieldValue.arrayUnion({ status: 'sent', at }) });
      return { status: 'sent', messageId, providerMessageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const at = now();
      await ref.update({ status: 'failed', error, updatedAt: at, statusHistory: FieldValue.arrayUnion({ status: 'failed', at }) });
      return { status: 'failed', messageId, error };
    }
  }

  /** Transactional consent: anyone who gave their number for a purchase, unless they opted out. */
  const transactionalBlocked = (c: Pick<Customer, 'consent'> | null) => c?.consent.transactional.status === 'opted_out';

  return {
    mode: transport.mode,

    /** OTP: the code is sent by the OTP provider; this records that it happened (never the code). */
    async logOtp(input: { to: string; ok: boolean; providerMessageId?: string | null; error?: string | null }) {
      const id = await log({ category: 'otp', template: T.otp, to: input.to, customerId: null, related: { type: 'login', id: input.to } });
      const at = now();
      await db.collection('whatsappMessages').doc(id).update(
        input.ok
          ? { status: 'sent', providerMessageId: input.providerMessageId ?? null, updatedAt: at, statusHistory: FieldValue.arrayUnion({ status: 'sent', at }) }
          : { status: 'failed', error: input.error ?? 'OTP not sent', updatedAt: at, statusHistory: FieldValue.arrayUnion({ status: 'failed', at }) }
      );
      return id;
    },

    /**
     * The invoice PDF as a WhatsApp document, with the approved invoice
     * template: "Hi {{1}}, thank you for your purchase from Karthys Gallery.
     * Invoice: {{2}} Order: {{3}} Amount: ₹{{4}} Your invoice is attached."
     */
    async sendInvoice(input: { invoice: Invoice; pdf: Uint8Array; customer: Pick<Customer, 'consent'> | null }): Promise<SendOutcome> {
      const { invoice } = input;
      const to = invoice.customer.phone;
      if (!to) return { status: 'skipped', reason: 'No mobile number on the invoice.' };
      if (transactionalBlocked(input.customer)) return { status: 'skipped', reason: 'The customer opted out of WhatsApp messages.' };
      return send({
        category: 'transactional',
        template: T.invoice,
        to,
        customerId: invoice.customerId,
        related: { type: 'invoice', id: invoice.id },
        components: async () => {
          const filename = `${invoice.invoiceNo}.pdf`;
          const mediaId = await transport.uploadDocument({ bytes: input.pdf, filename, mimeType: 'application/pdf' });
          return [
            { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename } }] },
            { type: 'body', parameters: [text(firstName(invoice.customer.name)), text(invoice.invoiceNo), text(invoice.orderNo ?? 'In-store purchase'), text(rupees(invoice.total))] },
          ];
        },
      });
    },

    async sendOrderConfirmation(input: { to: string; customerId: string | null; customer: Pick<Customer, 'consent'> | null; name: string; orderId: string; orderNo: string; total: number }) {
      if (transactionalBlocked(input.customer)) return { status: 'skipped', reason: 'Opted out' } as SendOutcome;
      return send({ category: 'transactional', template: T.orderConfirmation, to: input.to, customerId: input.customerId, related: { type: 'order', id: input.orderId }, components: async () => [{ type: 'body', parameters: [text(firstName(input.name)), text(input.orderNo), text(rupees(input.total))] }] });
    },

    async sendPaymentConfirmation(input: { to: string; customerId: string | null; customer: Pick<Customer, 'consent'> | null; name: string; orderId: string; orderNo: string; total: number }) {
      if (transactionalBlocked(input.customer)) return { status: 'skipped', reason: 'Opted out' } as SendOutcome;
      return send({ category: 'transactional', template: T.paymentConfirmation, to: input.to, customerId: input.customerId, related: { type: 'order', id: input.orderId }, components: async () => [{ type: 'body', parameters: [text(firstName(input.name)), text(rupees(input.total)), text(input.orderNo)] }] });
    },

    async sendShippingUpdate(input: { to: string; customerId: string | null; customer: Pick<Customer, 'consent'> | null; name: string; orderId: string; orderNo: string; courier: string; awb: string }) {
      if (transactionalBlocked(input.customer)) return { status: 'skipped', reason: 'Opted out' } as SendOutcome;
      return send({ category: 'transactional', template: T.shippingUpdate, to: input.to, customerId: input.customerId, related: { type: 'order', id: input.orderId }, components: async () => [{ type: 'body', parameters: [text(firstName(input.name)), text(input.orderNo), text(input.courier), text(input.awb)] }] });
    },

    /** Marketing: refused unless the customer has a recorded marketing opt-in (and no later opt-out). */
    async sendMarketingMessage(input: { customer: Customer; campaignId: string; template: string; bodyParams: string[] }): Promise<SendOutcome> {
      if (input.customer.consent.marketing.status !== 'opted_in') return { status: 'skipped', reason: 'No marketing opt-in.' };
      return send({
        category: 'marketing',
        template: input.template,
        to: input.customer.phone,
        customerId: input.customer.id,
        related: { type: 'campaign', id: input.campaignId },
        components: async () => (input.bodyParams.length ? [{ type: 'body', parameters: input.bodyParams.map((p) => text(p.replace(/\{\{name\}\}/g, firstName(input.customer.name)))) }] : []),
      });
    },

    /**
     * A status from the WhatsApp webhook (sent → delivered → read, or
     * failed). Moves forward only, and mirrors it onto the invoice or the
     * campaign the message belongs to. Unknown ids are ignored (returns false).
     */
    async recordStatus(input: { providerMessageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; at: string; error?: string | null }): Promise<boolean> {
      const snap = await db.collection('whatsappMessages').where('providerMessageId', '==', input.providerMessageId).limit(1).get();
      const doc = snap.docs[0];
      if (!doc) return false;
      const msg = doc.data() as WhatsAppMessage;
      if (STATUS_RANK[input.status] <= STATUS_RANK[msg.status] && input.status !== 'failed') return true;
      if (msg.status === 'failed') return true;
      await doc.ref.update({ status: input.status, updatedAt: input.at, ...(input.error && { error: input.error }), statusHistory: FieldValue.arrayUnion({ status: input.status, at: input.at }) });
      if (msg.related?.type === 'invoice') {
        await db.collection('invoices').doc(msg.related.id).update({ 'whatsapp.status': input.status, 'whatsapp.at': input.at, ...(input.error && { 'whatsapp.error': input.error }) }).catch(() => undefined);
      }
      if (msg.related?.type === 'campaign' && msg.customerId) {
        const campaign = db.collection('whatsappCampaigns').doc(msg.related.id);
        const field = input.status === 'failed' ? 'failed' : input.status;
        await campaign.collection('recipients').doc(msg.customerId).set({ status: input.status, updatedAt: input.at }, { merge: true });
        if (field !== 'sent') await campaign.update({ [`counts.${field}`]: FieldValue.increment(1), updatedAt: input.at }).catch(() => undefined);
      }
      return true;
    },
  };
}

export type WhatsAppService = ReturnType<typeof createWhatsAppService>;
