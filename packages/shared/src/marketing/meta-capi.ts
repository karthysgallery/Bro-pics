import { createHash } from 'node:crypto';

/**
 * Meta Conversions API (server-side events) for paid orders.
 *
 * - Sent only for an order whose payment the server verified (paymentStatus 'paid'), and only when the customer
 *   allowed ad measurement in the cookie banner (order.attribution.adConsent).
 * - event_id is `purchase_<orderId>`, the same id the browser Pixel uses, so Meta keeps one Purchase per order.
 * - Personal data is normalised and SHA-256 hashed before it leaves the server, as Meta requires. Nothing about the
 *   payment itself (card, UPI, bank) is ever sent.
 */

export const META_GRAPH_VERSION = 'v21.0';
/** Meta rejects website events older than 7 days. */
export const META_MAX_EVENT_AGE_S = 7 * 24 * 3600;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Lower-case, trimmed; '' stays ''. */
const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** Indian mobile as Meta wants it before hashing: country code + digits, no symbols. */
export function normalisePhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d;
}

export interface CapiOrder {
  id: string;
  paymentStatus?: string;
  total: number;
  userId?: string;
  customerName?: string;
  addressJson?: { phone?: string; city?: string; state?: string; pincode?: string; name?: string; fullName?: string } & Record<string, unknown>;
  attribution?: { fbc?: string; fbp?: string; userAgent?: string; adConsent?: boolean };
}

export interface CapiItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface CapiPurchaseInput {
  order: CapiOrder;
  items: CapiItem[];
  email?: string | null;
  /** When the payment was confirmed (seconds since epoch). */
  eventTimeS: number;
  siteUrl: string;
}

export type CapiSkipReason = 'not_paid' | 'no_consent' | 'too_old' | 'no_items';

/** Why this order must not be sent, or null when it may. */
export function capiSkipReason(input: CapiPurchaseInput, nowS: number): CapiSkipReason | null {
  if (input.order.paymentStatus !== 'paid') return 'not_paid';
  if (input.order.attribution?.adConsent !== true) return 'no_consent';
  if (nowS - input.eventTimeS > META_MAX_EVENT_AGE_S) return 'too_old';
  if (input.items.length === 0) return 'no_items';
  return null;
}

export const purchaseEventIdFor = (orderId: string) => `purchase_${orderId}`;

/** The one event Meta receives for a paid order. */
export function buildPurchaseEvent(input: CapiPurchaseInput) {
  const { order, items } = input;
  const a = order.addressJson ?? {};
  const name = norm(order.customerName || (a.fullName as string) || (a.name as string));
  const [first, ...rest] = name.split(/\s+/).filter(Boolean);
  const phone = normalisePhone(a.phone);
  const email = norm(input.email);
  const user_data: Record<string, unknown> = {
    country: [sha256('in')],
    ...(email && { em: [sha256(email)] }),
    ...(phone && { ph: [sha256(phone)] }),
    ...(first && { fn: [sha256(first)] }),
    ...(rest.length && { ln: [sha256(rest.join(' '))] }),
    ...(a.city && { ct: [sha256(norm(a.city).replace(/\s+/g, ''))] }),
    ...(a.state && { st: [sha256(norm(a.state).replace(/\s+/g, ''))] }),
    ...(a.pincode && { zp: [sha256(String(a.pincode).replace(/\s+/g, ''))] }),
    ...(order.userId && { external_id: [sha256(order.userId)] }),
    ...(order.attribution?.fbc && { fbc: order.attribution.fbc }),
    ...(order.attribution?.fbp && { fbp: order.attribution.fbp }),
    ...(order.attribution?.userAgent && { client_user_agent: order.attribution.userAgent }),
  };
  const byProduct = new Map<string, { quantity: number; total: number }>();
  for (const i of items) {
    const p = byProduct.get(i.productId) ?? { quantity: 0, total: 0 };
    p.quantity += i.qty;
    p.total += i.unitPrice * i.qty;
    byProduct.set(i.productId, p);
  }
  return {
    event_name: 'Purchase',
    event_time: input.eventTimeS,
    event_id: purchaseEventIdFor(order.id),
    action_source: 'website',
    event_source_url: `${input.siteUrl.replace(/\/$/, '')}/checkout`,
    user_data,
    custom_data: {
      currency: 'INR',
      value: Math.round(order.total) / 100,
      order_id: order.id,
      content_type: 'product_group',
      content_ids: [...byProduct.keys()],
      contents: [...byProduct.entries()].map(([id, p]) => ({ id, quantity: p.quantity, item_price: Math.round(p.total / p.quantity) / 100 })),
      num_items: items.reduce((n, i) => n + i.qty, 0),
    },
  };
}

/** POSTs events to Meta. Returns Meta's reply; throws on a network error or a non-2xx answer. */
export async function sendCapiEvents(opts: { pixelId: string; accessToken: string; events: unknown[]; testEventCode?: string; fetchImpl?: typeof fetch }): Promise<{ events_received?: number; fbtrace_id?: string }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(opts.pixelId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: opts.events, access_token: opts.accessToken, ...(opts.testEventCode && { test_event_code: opts.testEventCode }) }),
  });
  const body = (await res.json().catch(() => ({}))) as { events_received?: number; fbtrace_id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Meta CAPI ${res.status}: ${body.error?.message ?? 'request failed'}`);
  return body;
}
