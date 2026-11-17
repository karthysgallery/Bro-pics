import { describe, expect, it, vi } from 'vitest';
import { buildPurchaseEvent, capiSkipReason, normalisePhone, sendCapiEvents, sha256, type CapiPurchaseInput } from './meta-capi';

const base: CapiPurchaseInput = {
  order: {
    id: 'ord1',
    paymentStatus: 'paid',
    total: 149800,
    userId: 'u1',
    customerName: 'Priya Kumar',
    addressJson: { phone: '+91 98765 43210', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    attribution: { adConsent: true, fbc: 'fb.1.1.abc', fbp: 'fb.1.2.def', userAgent: 'UA' },
  },
  items: [
    { productId: 'p1', qty: 1, unitPrice: 49900 },
    { productId: 'p1', qty: 1, unitPrice: 99900 },
  ],
  email: ' Priya@Example.com ',
  eventTimeS: 1_800_000_000,
  siteUrl: 'https://karthysgallery.in/',
};

describe('Meta Conversions API purchase', () => {
  it('normalises Indian phone numbers with the country code', () => {
    expect(normalisePhone('98765 43210')).toBe('919876543210');
    expect(normalisePhone('+91-98765-43210')).toBe('919876543210');
    expect(normalisePhone('09876543210')).toBe('919876543210');
    expect(normalisePhone('')).toBe('');
  });

  it('uses the same event id as the browser and hashes personal data', () => {
    const e = buildPurchaseEvent(base);
    expect(e.event_id).toBe('purchase_ord1');
    expect(e.event_name).toBe('Purchase');
    expect(e.user_data.em).toEqual([sha256('priya@example.com')]);
    expect(e.user_data.ph).toEqual([sha256('919876543210')]);
    expect(e.user_data.fn).toEqual([sha256('priya')]);
    expect(e.user_data.ct).toEqual([sha256('chennai')]);
    expect(e.user_data.st).toEqual([sha256('tamilnadu')]);
    expect(JSON.stringify(e)).not.toContain('Priya');
    expect(JSON.stringify(e)).not.toContain('98765');
    expect(e.user_data.fbc).toBe('fb.1.1.abc');
  });

  it('sends the paid total in rupees and one content per product', () => {
    const e = buildPurchaseEvent(base);
    expect(e.custom_data.value).toBe(1498);
    expect(e.custom_data.currency).toBe('INR');
    expect(e.custom_data.content_ids).toEqual(['p1']);
    expect(e.custom_data.contents).toEqual([{ id: 'p1', quantity: 2, item_price: 749 }]);
    expect(e.custom_data.num_items).toBe(2);
    expect(e.event_source_url).toBe('https://karthysgallery.in/checkout');
  });

  it('never sends an unpaid order, one without consent, or one older than 7 days', () => {
    const now = base.eventTimeS + 60;
    expect(capiSkipReason(base, now)).toBeNull();
    expect(capiSkipReason({ ...base, order: { ...base.order, paymentStatus: 'pending' } }, now)).toBe('not_paid');
    expect(capiSkipReason({ ...base, order: { ...base.order, paymentStatus: 'failed' } }, now)).toBe('not_paid');
    expect(capiSkipReason({ ...base, order: { ...base.order, attribution: { adConsent: false } } }, now)).toBe('no_consent');
    expect(capiSkipReason({ ...base, order: { ...base.order, attribution: undefined } }, now)).toBe('no_consent');
    expect(capiSkipReason(base, base.eventTimeS + 8 * 24 * 3600)).toBe('too_old');
  });

  it('posts to the Pixel with the token in the body, never the URL', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    await sendCapiEvents({ pixelId: '123456789012345', accessToken: 'SECRET', events: [{}], testEventCode: 'TEST1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789012345/events');
    expect(url).not.toContain('SECRET');
    expect(JSON.parse(String(init.body))).toMatchObject({ access_token: 'SECRET', test_event_code: 'TEST1' });
  });

  it('throws on a Meta error so the caller can retry', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid token' } }), { status: 400 }));
    await expect(sendCapiEvents({ pixelId: '1', accessToken: 'x', events: [], fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow('Invalid token');
  });
});
