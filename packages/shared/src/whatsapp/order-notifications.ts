import { maskPhone, normalizePhoneE164 } from './contact-import';
import type { TemplateKey } from './templates';

/**
 * Which order changes produce a customer WhatsApp message, and what goes into it. Pure: the order lifecycle is the source of
 * truth (a message is derived from a real before/after change of the order document), and nothing here invents a status,
 * a tracking number or a link.
 */

export type OrderEvent = 'order_confirmed' | 'order_processing' | 'order_shipped' | 'order_delivered' | 'order_cancelled' | 'refund_status';

export const EVENT_TEMPLATE: Record<OrderEvent, TemplateKey> = {
  order_confirmed: 'order_confirmed',
  order_processing: 'order_processing',
  order_shipped: 'order_shipped',
  order_delivered: 'order_delivered',
  order_cancelled: 'order_cancelled',
  refund_status: 'refund_status',
};

export interface OrderFields {
  userId?: string;
  orderNo?: string;
  status?: string;
  paymentStatus?: string;
  total?: number;
  customerName?: string;
  addressJson?: Record<string, unknown> | null;
  shipmentTracking?: { provider?: string; awbNumber?: string; trackingUrl?: string | null } | null;
}

const PRODUCTION_STARTED = new Set(['in_production']);

/** The events a single change of an order produces (usually none). */
export function orderEventsFromChange(before: OrderFields | undefined, after: OrderFields | undefined): OrderEvent[] {
  if (!after) return [];
  const events: OrderEvent[] = [];
  // Only the server's own settlement sets paymentStatus to paid: never before a verified payment.
  if (after.paymentStatus === 'paid' && before?.paymentStatus !== 'paid' && after.status !== 'pending_payment') events.push('order_confirmed');
  if (before?.status !== after.status && after.status) {
    if (PRODUCTION_STARTED.has(after.status)) events.push('order_processing');
    // A dispatch message needs a real dispatch record: courier and tracking number.
    else if (after.status === 'shipped' && after.shipmentTracking?.provider && after.shipmentTracking?.awbNumber) events.push('order_shipped');
    else if (after.status === 'delivered') events.push('order_delivered');
    else if (after.status === 'cancelled') events.push('order_cancelled');
    else if (after.status === 'refunded') events.push('refund_status');
  }
  return events;
}

const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'there';
const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Customer-supplied text goes into a template variable as plain text only: control characters and line breaks removed, length capped. */
export const safeVar = (s: string, max = 60) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max) || '-';

export type OrderMessagePlan = { ok: true; to: string; template: TemplateKey; variables: string[] } | { ok: false; reason: string };

/** The recipient and the template variables for an event, or why nothing can be sent. */
export function planOrderMessage(event: OrderEvent, order: OrderFields): OrderMessagePlan {
  const phoneRaw = typeof order.addressJson?.phone === 'string' ? order.addressJson.phone : '';
  let to: string;
  try {
    to = normalizePhoneE164(phoneRaw);
  } catch {
    return { ok: false, reason: 'No valid mobile number on the order.' };
  }
  const name = safeVar(firstName(order.customerName ?? (typeof order.addressJson?.recipientName === 'string' ? order.addressJson.recipientName : undefined)), 40);
  const orderNo = safeVar(order.orderNo ?? '', 30);
  if (!order.orderNo) return { ok: false, reason: 'The order has no order number yet.' };
  switch (event) {
    case 'order_confirmed':
      if (typeof order.total !== 'number') return { ok: false, reason: 'The order has no total.' };
      return { ok: true, to, template: 'order_confirmed', variables: [name, orderNo, rupees(order.total)] };
    case 'order_processing':
    case 'order_delivered':
    case 'order_cancelled':
      return { ok: true, to, template: EVENT_TEMPLATE[event], variables: [name, orderNo] };
    case 'refund_status':
      return { ok: true, to, template: 'refund_status', variables: [name, orderNo, 'processed'] };
    case 'order_shipped': {
      const t = order.shipmentTracking;
      if (!t?.provider || !t.awbNumber) return { ok: false, reason: 'No courier and tracking number recorded.' };
      const url = typeof t.trackingUrl === 'string' && /^https:\/\/[^\s]+$/.test(t.trackingUrl) ? t.trackingUrl : null;
      return { ok: true, to, template: 'order_shipped', variables: [name, orderNo, safeVar(t.provider, 40), safeVar(t.awbNumber, 40), url ? `Track it here: ${url}` : 'You can track it on the courier’s website with this number.'] };
    }
  }
}

/** Seconds to wait before retry number `attempt` (1-based); null = stop retrying. */
export function retryDelaySeconds(attempt: number): number | null {
  const schedule = [300, 1800, 7200];
  return attempt >= 1 && attempt <= schedule.length ? schedule[attempt - 1] : null;
}

/** Network errors, 5xx, 429 and WhatsApp's throttling codes can succeed later; template, number and permission errors cannot. */
export function isRetryableError(message: string): boolean {
  if (/HTTP (5\d\d|429)\b/.test(message)) return true;
  if (/fetch failed|ECONNRESET|ETIMEDOUT|network|timeout/i.test(message)) return true;
  const code = /\(code (\d+)\)/.exec(message)?.[1];
  return code !== undefined && ['1', '2', '4', '17', '32', '613', '80007', '130429', '131016', '131056', '133004'].includes(code);
}

export { maskPhone };
