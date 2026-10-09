import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

const recordStatus = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../../../lib/billing/server', () => ({
  whatsappService: () => ({ recordStatus }),
  billingDb: () => ({
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async (ref: { path: string }) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
        update: (ref: { path: string }, patch: Record<string, unknown>) => {
          const doc = { ...store.get(ref.path) } as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'consent.marketing') doc.consent = { ...(doc.consent as object), marketing: v };
            else doc[k] = v;
          }
          store.set(ref.path, doc);
        },
        set: (ref: { path: string }, doc: Record<string, unknown>) => store.set(ref.path, doc),
      }),
  }),
}));

import { GET, POST } from './route';

const SECRET = 'test-app-secret';
const sign = (raw: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
const post = (body: unknown, signature?: string | null) => {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sig = signature === undefined ? sign(raw) : signature;
  if (sig) headers['X-Hub-Signature-256'] = sig;
  return POST(new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: raw, headers }));
};
const wrap = (value: unknown) => ({ entry: [{ changes: [{ value }] }] });

describe('WhatsApp webhook', () => {
  beforeEach(() => {
    recordStatus.mockReset();
    store.clear();
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    vi.stubEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'verify-me');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('answers Meta’s subscription check only with the right verify token', async () => {
    const ok = await GET(new Request('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('42');
    const bad = await GET(new Request('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'));
    expect(bad.status).toBe(403);
  });

  it('refuses unsigned, wrongly signed, or unconfigured requests', async () => {
    expect((await post(wrap({}), null)).status).toBe(401);
    expect((await post(wrap({}), sign('{}', 'other-secret'))).status).toBe(401);
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    expect((await post(wrap({}))).status).toBe(401);
    expect(recordStatus).not.toHaveBeenCalled();
  });

  it('records delivery statuses, with the failure reason, and ignores unknown ones', async () => {
    const res = await post(
      wrap({
        statuses: [
          { id: 'wamid.1', status: 'delivered', timestamp: '1760000000' },
          { id: 'wamid.2', status: 'failed', timestamp: '1760000000', errors: [{ title: 'Message undeliverable', code: 131026 }] },
          { id: 'wamid.3', status: 'deleted' },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect(recordStatus).toHaveBeenCalledTimes(2);
    expect(recordStatus).toHaveBeenCalledWith({ providerMessageId: 'wamid.1', status: 'delivered', at: new Date(1760000000 * 1000).toISOString(), error: null });
    expect(recordStatus).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: 'wamid.2', status: 'failed', error: 'Message undeliverable (code 131026)' }));
  });

  it('opts an existing customer out on STOP and back in on START, leaving transactional consent alone', async () => {
    store.set('customers/p919876543210', { phone: '+919876543210', consent: { transactional: { status: 'opted_in' }, marketing: { status: 'opted_in' } } });
    await post(wrap({ messages: [{ from: '919876543210', type: 'text', text: { body: 'STOP' } }] }));
    let doc = store.get('customers/p919876543210') as { consent: Record<string, { status: string; source?: string }> };
    expect(doc.consent.marketing).toMatchObject({ status: 'opted_out', source: 'whatsapp_reply' });
    expect(doc.consent.transactional.status).toBe('opted_in');

    await post(wrap({ messages: [{ from: '919876543210', type: 'button', button: { text: 'Start' } }] }));
    doc = store.get('customers/p919876543210') as typeof doc;
    expect(doc.consent.marketing.status).toBe('opted_in');
  });

  it('creates an opted-out record for an unknown number that replies STOP, and ignores ordinary chat', async () => {
    await post(wrap({ messages: [{ from: '919811112222', type: 'text', text: { body: 'stop' } }] }));
    const doc = store.get('customers/p919811112222') as { phone: string; consent: { marketing: { status: string } } };
    expect(doc.phone).toBe('+919811112222');
    expect(doc.consent.marketing.status).toBe('opted_out');

    await post(wrap({ messages: [{ from: '919833334444', type: 'text', text: { body: 'Is my order ready?' } }] }));
    expect(store.has('customers/p919833334444')).toBe(false);
  });
});
