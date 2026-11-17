import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { becamePaid, processMetaPurchase } from './meta-purchase';

/** A tiny in-memory Firestore: enough for get/set(merge)/runTransaction on fixed paths. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const docRef = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path), get: (k: string) => store.get(path)?.[k] }),
    set: async (v: Record<string, unknown>, o?: { merge?: boolean }) => void store.set(path, o?.merge ? { ...(store.get(path) ?? {}), ...v } : v),
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: async () => ({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')).map(([, v]) => ({ data: () => v })) }),
  });
  const db = {
    collection: (name: string) => col(name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({ get: (ref: ReturnType<typeof docRef>) => ref.get(), set: (ref: ReturnType<typeof docRef>, v: Record<string, unknown>, o?: { merge?: boolean }) => void ref.set(v, o) }),
  };
  return { db: db as unknown as Firestore, store };
}

const TOKEN = 'EAAG'.padEnd(40, 'x');
const seed = () => ({
  'settings/marketing': { metaEnabled: true, metaPixelId: '123456789012345', metaTestEventCode: '' },
  'orders/o1': { paymentStatus: 'paid', total: 49900, userId: 'u1', addressJson: { phone: '9876543210', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' }, attribution: { adConsent: true, fbp: 'fb.1.1.1' } },
  'orders/o1/items/i1': { productId: 'p1', qty: 1, unitPrice: 49900 },
  'users/u1': { email: 'a@b.in' },
});

describe('Meta purchase (Conversions API)', () => {
  it('reacts only when an order becomes paid', () => {
    expect(becamePaid({ paymentStatus: 'pending' }, { paymentStatus: 'paid' })).toBe(true);
    expect(becamePaid({ paymentStatus: 'paid' }, { paymentStatus: 'paid' })).toBe(false);
    expect(becamePaid({ paymentStatus: 'pending' }, { paymentStatus: 'failed' })).toBe(false);
    expect(becamePaid(undefined, { paymentStatus: 'pending' })).toBe(false);
  });

  it('sends one Purchase, and never again for the same order', async () => {
    const { db, store } = fakeDb(seed());
    const send = vi.fn(async () => ({ events_received: 1, fbtrace_id: 't' }));
    const nowS = 1_800_000_100;
    expect(await processMetaPurchase({ db, token: TOKEN, send, nowS }, 'o1', 1_800_000_000)).toBe('sent');
    expect(await processMetaPurchase({ db, token: TOKEN, send, nowS }, 'o1', 1_800_000_000)).toBe('already_done');
    expect(send).toHaveBeenCalledTimes(1);
    const call = (send.mock.calls[0] as unknown as [{ events: Array<{ event_id: string; custom_data: { value: number } }> }])[0];
    expect(call.events[0]!.event_id).toBe('purchase_o1');
    expect(call.events[0]!.custom_data.value).toBe(499);
    expect(store.get('metaEvents/purchase_o1')).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('does nothing while tracking is off or the token is missing', async () => {
    const off = fakeDb({ ...seed(), 'settings/marketing': { metaEnabled: false, metaPixelId: '123456789012345' } });
    const send = vi.fn();
    expect(await processMetaPurchase({ db: off.db, token: TOKEN, send }, 'o1', 1)).toBe('disabled');
    const noToken = fakeDb(seed());
    expect(await processMetaPurchase({ db: noToken.db, token: '', send }, 'o1', 1)).toBe('disabled');
    expect(send).not.toHaveBeenCalled();
    expect(off.store.has('metaEvents/purchase_o1')).toBe(false);
  });

  it('records a skip (no send) when the customer did not allow ad measurement', async () => {
    const s = seed();
    (s['orders/o1'] as Record<string, unknown>).attribution = { adConsent: false };
    const { db, store } = fakeDb(s);
    const send = vi.fn();
    expect(await processMetaPurchase({ db, token: TOKEN, send, nowS: 1_800_000_100 }, 'o1', 1_800_000_000)).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(store.get('metaEvents/purchase_o1')).toMatchObject({ status: 'skipped', reason: 'no_consent' });
  });

  it('marks a failed send for retry, then succeeds on the retry', async () => {
    const { db, store } = fakeDb(seed());
    const failing = vi.fn(async () => {
      throw new Error('Meta CAPI 500: down');
    });
    expect(await processMetaPurchase({ db, token: TOKEN, send: failing, nowS: 1_800_000_100 }, 'o1', 1_800_000_000)).toBe('failed');
    expect(store.get('metaEvents/purchase_o1')).toMatchObject({ status: 'failed', attempts: 1 });
    const ok = vi.fn(async () => ({ events_received: 1 }));
    expect(await processMetaPurchase({ db, token: TOKEN, send: ok, nowS: 1_800_000_200 }, 'o1', 999)).toBe('sent');
    // The retry keeps the original event time.
    expect(store.get('metaEvents/purchase_o1')).toMatchObject({ status: 'sent', attempts: 2, eventTimeS: 1_800_000_000 });
  });
});
