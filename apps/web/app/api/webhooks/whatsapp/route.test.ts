import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

const recordStatus = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

const optOut = vi.hoisted(() => vi.fn());
const optIn = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/billing/server', () => ({ whatsappService: () => ({ recordStatus }), billingDb: () => ({}) }));
vi.mock('@bro-pics/shared/src/whatsapp/consent', () => ({ recordMarketingOptOut: optOut, recordCustomerOptIn: optIn }));

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
    optOut.mockReset();
    optIn.mockReset();
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

  it('STOP opts the number out (and onto the suppression list) through the shared consent code; START is the customer\'s own opt-in with the reply kept as evidence', async () => {
    await post(wrap({ messages: [{ from: '919876543210', type: 'text', text: { body: 'STOP' } }] }));
    expect(optOut).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: '+919876543210', source: 'whatsapp_reply' }));
    expect(optIn).not.toHaveBeenCalled();

    await post(wrap({ messages: [{ from: '919876543210', type: 'button', button: { text: 'Start' } }] }));
    expect(optIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: '+919876543210', source: 'whatsapp_reply', evidence: expect.stringMatching(/START/) }));
  });

  it('an unknown number that replies stop is handled, and ordinary chat changes nothing', async () => {
    await post(wrap({ messages: [{ from: '919811112222', type: 'text', text: { body: 'stop' } }] }));
    expect(optOut).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: '+919811112222' }));

    optOut.mockClear();
    await post(wrap({ messages: [{ from: '919833334444', type: 'text', text: { body: 'Is my order ready?' } }] }));
    expect(optOut).not.toHaveBeenCalled();
    expect(optIn).not.toHaveBeenCalled();
  });
});
