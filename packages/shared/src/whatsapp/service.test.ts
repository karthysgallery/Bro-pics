import { describe, it, expect, vi } from 'vitest';
import { CloudTransport, DisabledTransport, MockTransport, transportFromEnv, templateNames } from './service';

describe('WhatsApp transport', () => {
  it('is mock in development, Cloud API in production with credentials, and disabled (failing loudly) without them', () => {
    expect(transportFromEnv({ NODE_ENV: 'development' })).toBeInstanceOf(MockTransport);
    expect(transportFromEnv({ NODE_ENV: 'production', WHATSAPP_OTP_MODE: 'production', WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' })).toBeInstanceOf(CloudTransport);
    expect(transportFromEnv({ NODE_ENV: 'production', WHATSAPP_OTP_MODE: 'production' })).toBeInstanceOf(DisabledTransport);
    expect(transportFromEnv({ NODE_ENV: 'production' })).toBeInstanceOf(DisabledTransport);
    expect(transportFromEnv({ NODE_ENV: 'production', WHATSAPP_MODE: 'mock' })).toBeInstanceOf(MockTransport);
  });

  it('WHATSAPP_MODE=disabled keeps invoice/order messages off even when OTP is in production with credentials', () => {
    const live = { NODE_ENV: 'production', WHATSAPP_OTP_MODE: 'production', WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' };
    expect(transportFromEnv(live)).toBeInstanceOf(CloudTransport);
    expect(transportFromEnv({ ...live, WHATSAPP_MODE: 'disabled' })).toBeInstanceOf(DisabledTransport);
    expect(transportFromEnv({ ...live, WHATSAPP_MODE: 'off' })).toBeInstanceOf(DisabledTransport);
    // Cloud Functions never receive the OTP number's credentials, so they stay disabled by default.
    expect(transportFromEnv({ NODE_ENV: 'production' })).toBeInstanceOf(DisabledTransport);
  });

  it('sends approved templates to the Cloud API with the server-side token, and uploads the PDF as media', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith('/media') ? new Response(JSON.stringify({ id: 'media_1' })) : new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }))
    );
    const t = new CloudTransport({ accessToken: 'secret', phoneNumberId: '555' }, fetchMock as unknown as typeof fetch);
    expect(await t.uploadDocument({ bytes: new Uint8Array([37, 80, 68, 70]), filename: 'KG-INV-2026-000001.pdf', mimeType: 'application/pdf' })).toBe('media_1');
    expect(await t.sendTemplate({ to: '+919876543210', template: 'karthys_invoice', language: 'en', components: [] })).toEqual({ providerMessageId: 'wamid.X' });
    const [url, init] = fetchMock.mock.calls[1]! as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/555/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: '919876543210', type: 'template', template: { name: 'karthys_invoice', language: { code: 'en' } } });
  });

  it("reports WhatsApp's own error text when a send is refused", async () => {
    const t = new CloudTransport({ accessToken: 'x', phoneNumberId: '1' }, (async () => new Response(JSON.stringify({ error: { message: 'Template name does not exist', code: 132001 } }), { status: 400 })) as unknown as typeof fetch);
    await expect(t.sendTemplate({ to: '+91', template: 'nope', language: 'en', components: [] })).rejects.toThrow('Template name does not exist (code 132001)');
  });

  it('uses overridable template names', () => {
    expect(templateNames({}).invoice).toBe('karthys_invoice');
    expect(templateNames({ WHATSAPP_TEMPLATE_INVOICE: 'kg_bill' }).invoice).toBe('kg_bill');
  });
});

import { graphBase, DEFAULT_GRAPH_VERSION } from './service';
describe('Graph API version', () => {
  it('defaults to the current version and can be overridden, but only with a well-formed version', () => {
    expect(DEFAULT_GRAPH_VERSION).toBe('v25.0');
    expect(graphBase({})).toBe('https://graph.facebook.com/v25.0');
    expect(graphBase({ WHATSAPP_GRAPH_VERSION: 'v26.0' })).toBe('https://graph.facebook.com/v26.0');
    expect(graphBase({ WHATSAPP_GRAPH_VERSION: '../evil' })).toBe('https://graph.facebook.com/v25.0');
  });
});
