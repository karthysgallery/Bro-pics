import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Customer, WhatsAppMessage } from '../schemas/billing';
import { transactionalEligibility } from './consent';
import { isRetryableError, planOrderMessage, retryDelaySeconds, EVENT_TEMPLATE, type OrderEvent, type OrderFields } from './order-notifications';
import type { WhatsAppTransport } from './service';
import { templateNameFor } from './templates';

/**
 * Sends the order-lifecycle WhatsApp messages. Guarantees:
 *  - ONCE per (order, event): the log document id is `wa_{orderId}_{event}` and is created in a transaction, so a retried
 *    trigger, a redelivered webhook or two workers cannot send twice.
 *  - A WhatsApp failure is only recorded. It never throws into the order, payment or invoice code that called it.
 *  - Failures are retried with backoff (5 min, 30 min, 2 h) only when the error can succeed later.
 *  - Nothing is sent, and nothing is logged as failed, while WhatsApp is switched off (transport 'disabled').
 * Server-only.
 */

export const messageIdFor = (orderId: string, event: OrderEvent) => `wa_${orderId}_${event}`;

export type OrderSendOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; messageId: string; error: string; willRetry: boolean };

export interface OrderNotifierDeps {
  db: Firestore;
  transport: WhatsAppTransport;
  language?: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export function createOrderNotifier(deps: OrderNotifierDeps) {
  const { db, transport } = deps;
  const now = () => (deps.now ?? (() => new Date()))();
  const language = deps.language ?? deps.env?.WHATSAPP_TEMPLATE_LANGUAGE ?? process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';

  async function send(input: { orderId: string; event: OrderEvent; order: OrderFields; customer: Pick<Customer, 'phone' | 'consent'> | null; customerId?: string | null }): Promise<OrderSendOutcome> {
    if (transport.mode === 'disabled') return { status: 'skipped', reason: 'WhatsApp is switched off on the server.' };
    const plan = planOrderMessage(input.event, input.order);
    if (!plan.ok) return { status: 'skipped', reason: plan.reason };
    if (input.customer && !transactionalEligibility({ phone: plan.to, consent: input.customer.consent })) return { status: 'skipped', reason: 'The customer opted out of WhatsApp messages.' };

    const id = messageIdFor(input.orderId, input.event);
    const ref = db.collection('whatsappMessages').doc(id);
    const at = now().toISOString();
    const template = templateNameFor(EVENT_TEMPLATE[input.event], deps.env ?? process.env);

    // Claim the send. Only the caller that moves the record into "queued" goes on to send.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const m = snap.data() as WhatsAppMessage;
        const retryable = m.status === 'failed' && m.nextAttemptAt && m.nextAttemptAt <= at && (m.attempts ?? 1) < 4;
        if (!retryable) return null;
        tx.update(ref, { status: 'queued', updatedAt: at, nextAttemptAt: null, statusHistory: FieldValue.arrayUnion({ status: 'queued', at }) });
        return { attempts: m.attempts ?? 1 };
      }
      const msg: WhatsAppMessage = {
        id,
        category: 'transactional',
        template,
        to: plan.to,
        customerId: input.customerId ?? null,
        related: { type: 'order', id: input.orderId },
        status: 'queued',
        providerMessageId: null,
        error: null,
        provider: transport.mode === 'cloud' ? 'cloud' : 'mock',
        createdAt: at,
        updatedAt: at,
        statusHistory: [{ status: 'queued', at }],
        event: input.event,
        attempts: 0,
        nextAttemptAt: null,
      };
      tx.create(ref, msg);
      return { attempts: 0 };
    });
    if (!claimed) return { status: 'skipped', reason: 'Already handled for this order.' };

    try {
      const { providerMessageId } = await transport.sendTemplate({
        to: plan.to,
        template,
        language,
        components: [{ type: 'body', parameters: plan.variables.map((t) => ({ type: 'text', text: t })) }],
      });
      const done = now().toISOString();
      await ref.update({ status: 'sent', providerMessageId, error: null, attempts: claimed.attempts + 1, nextAttemptAt: null, updatedAt: done, statusHistory: FieldValue.arrayUnion({ status: 'sent', at: done }) });
      return { status: 'sent', messageId: id };
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      const attempts = claimed.attempts + 1;
      const delay = isRetryableError(error) ? retryDelaySeconds(attempts) : null;
      const failedAt = now();
      await ref
        .update({
          status: 'failed',
          error,
          attempts,
          nextAttemptAt: delay === null ? null : new Date(failedAt.getTime() + delay * 1000).toISOString(),
          updatedAt: failedAt.toISOString(),
          statusHistory: FieldValue.arrayUnion({ status: 'failed', at: failedAt.toISOString() }),
        })
        .catch(() => undefined);
      return { status: 'failed', messageId: id, error, willRetry: delay !== null };
    }
  }

  /** Failed order messages whose retry time has come, oldest first. Returns the message ids that were due. */
  async function dueRetries(limit = 50): Promise<Array<{ id: string; orderId: string; event: OrderEvent }>> {
    const snap = await db.collection('whatsappMessages').where('status', '==', 'failed').where('nextAttemptAt', '<=', now().toISOString()).orderBy('nextAttemptAt').limit(limit).get();
    return snap.docs
      .map((d) => d.data() as WhatsAppMessage)
      .filter((m) => m.category === 'transactional' && m.related?.type === 'order' && m.event)
      .map((m) => ({ id: m.id, orderId: m.related!.id, event: m.event as OrderEvent }));
  }

  return { send, dueRetries };
}

export type OrderNotifier = ReturnType<typeof createOrderNotifier>;
