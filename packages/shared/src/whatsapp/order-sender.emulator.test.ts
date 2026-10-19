import { describe, it, expect, beforeAll } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createOrderNotifier, messageIdFor } from './order-sender';
import { DisabledTransport, MockTransport, type WhatsAppTransport } from './service';
import type { OrderFields } from './order-notifications';
import type { WhatsAppMessage } from '../schemas/billing';

// Real Firestore (emulator): firebase emulators:exec --only firestore "cd packages/shared && npx vitest run src/whatsapp"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

class FlakyTransport extends MockTransport {
  calls = 0;
  constructor(private readonly errors: string[]) {
    super();
  }
  override async sendTemplate(input: Parameters<MockTransport['sendTemplate']>[0]) {
    this.calls++;
    const e = this.errors.shift();
    if (e) throw new Error(e);
    return super.sendTemplate(input);
  }
}

describe.skipIf(!enabled)('order WhatsApp notifier (Firestore emulator, synthetic orders)', { timeout: 30_000 }, () => {
  let db: Firestore;
  const run = Math.random().toString(36).slice(2, 8);
  let n = 0;
  const order = (over: Partial<OrderFields> = {}): { id: string; fields: OrderFields } => ({
    id: `qa_${run}_${++n}`,
    fields: { orderNo: `BP-QA-${n}`, status: 'payment_confirmed', paymentStatus: 'paid', total: 50000, customerName: 'Test Customer', addressJson: { phone: '9000000555' }, ...over },
  });
  const read = async (id: string, e: Parameters<typeof messageIdFor>[1]) => (await db.collection('whatsappMessages').doc(messageIdFor(id, e)).get()).data() as WhatsAppMessage | undefined;
  beforeAll(() => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
  });
  const notifier = (transport: WhatsAppTransport, now?: () => Date) => createOrderNotifier({ db, transport, now, language: 'en', env: {} });

  it('sends once: the same event twice, even at the same moment, makes one WhatsApp call and one log record', async () => {
    const o = order();
    const transport = new MockTransport();
    const wa = notifier(transport);
    const results = await Promise.all([wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null }), wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })]);
    expect(results.filter((r) => r.status === 'sent')).toHaveLength(1);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].template).toBe('karthys_order_confirmed');
    const m = await read(o.id, 'order_confirmed');
    expect(m).toMatchObject({ category: 'transactional', status: 'sent', attempts: 1, event: 'order_confirmed' });
    expect(JSON.stringify(m)).not.toContain('Test'); // no message content or name in the log
    expect((await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })).status).toBe('skipped');
    expect(transport.sent).toHaveLength(1);
  });

  it('different events for the same order are separate messages', async () => {
    const o = order();
    const transport = new MockTransport();
    const wa = notifier(transport);
    await wa.send({ orderId: o.id, event: 'order_processing', order: o.fields, customer: null });
    await wa.send({ orderId: o.id, event: 'order_delivered', order: o.fields, customer: null });
    expect(transport.sent.map((s) => s.template)).toEqual(['karthys_order_processing', 'karthys_order_delivered']);
  });

  it('a provider failure is recorded, returned, never thrown; a retryable one is scheduled with backoff and later sent once', async () => {
    const o = order();
    let clock = new Date('2026-10-18T10:00:00Z');
    const transport = new FlakyTransport(['WhatsApp: HTTP 503']);
    const wa = notifier(transport, () => clock);
    const first = await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null });
    expect(first).toMatchObject({ status: 'failed', willRetry: true });
    let m = await read(o.id, 'order_confirmed');
    expect(m).toMatchObject({ status: 'failed', attempts: 1, nextAttemptAt: '2026-10-18T10:05:00.000Z' });

    // too early: nothing happens
    clock = new Date('2026-10-18T10:01:00Z');
    expect((await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })).status).toBe('skipped');
    expect(transport.calls).toBe(1);

    clock = new Date('2026-10-18T10:06:00Z');
    expect((await wa.dueRetries()).map((d) => d.orderId)).toContain(o.id);
    expect((await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })).status).toBe('sent');
    m = await read(o.id, 'order_confirmed');
    expect(m).toMatchObject({ status: 'sent', attempts: 2, nextAttemptAt: null });
    expect(transport.calls).toBe(2);
  });

  it('a permanent error (wrong template, undeliverable number) is not retried', async () => {
    const o = order();
    const wa = notifier(new FlakyTransport(['WhatsApp: Template name does not exist (code 132001)']));
    expect(await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })).toMatchObject({ status: 'failed', willRetry: false });
    expect((await read(o.id, 'order_confirmed'))!.nextAttemptAt).toBeNull();
  });

  it('retrying stops after the last backoff step', async () => {
    const o = order();
    let clock = new Date('2026-10-18T10:00:00Z');
    const wa = notifier(new FlakyTransport(Array(5).fill('WhatsApp: HTTP 503')), () => clock);
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null }));
      clock = new Date(clock.getTime() + 3 * 3600 * 1000);
    }
    expect(results.map((r) => (r.status === 'failed' ? r.willRetry : r.status))).toEqual([true, true, true, false]);
  });

  it('while WhatsApp is switched off nothing is sent and no failure is recorded', async () => {
    const o = order();
    const out = await notifier(new DisabledTransport()).send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null });
    expect(out.status).toBe('skipped');
    expect(await read(o.id, 'order_confirmed')).toBeUndefined();
  });

  it('respects an opt-out of order messages, and a marketing opt-out does not block them', async () => {
    const consent = (t: 'opted_out' | 'unknown', m: 'opted_out' | 'unknown') => ({ phone: '+919000000555', consent: { transactional: { status: t, at: null, source: null }, marketing: { status: m, at: null, source: null } } });
    const a = order();
    const t1 = new MockTransport();
    expect((await notifier(t1).send({ orderId: a.id, event: 'order_confirmed', order: a.fields, customer: consent('opted_out', 'unknown') })).status).toBe('skipped');
    expect(t1.sent).toHaveLength(0);
    const b = order();
    const t2 = new MockTransport();
    expect((await notifier(t2).send({ orderId: b.id, event: 'order_confirmed', order: b.fields, customer: consent('unknown', 'opted_out') })).status).toBe('sent');
  });

  it('nothing is sent for an order without a valid number, or a dispatch without a tracking number', async () => {
    const o = order({ addressJson: { phone: 'abc' } });
    const transport = new MockTransport();
    const wa = notifier(transport);
    expect((await wa.send({ orderId: o.id, event: 'order_confirmed', order: o.fields, customer: null })).status).toBe('skipped');
    const s = order();
    expect((await wa.send({ orderId: s.id, event: 'order_shipped', order: s.fields, customer: null })).status).toBe('skipped');
    expect(transport.sent).toHaveLength(0);
  });
});
