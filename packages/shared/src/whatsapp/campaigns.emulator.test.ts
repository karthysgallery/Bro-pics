import { describe, it, expect, beforeAll } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { selectAudience, sendCampaignBatch, startCampaign } from './campaigns';
import { createWhatsAppService, MockTransport } from './service';
import { consent, newCustomer } from '../billing/invoice-engine';
import type { Campaign, Customer, WhatsAppMessage } from '../schemas/billing';

// Real Firestore (emulator). Run:
//   firebase emulators:exec --only firestore "cd packages/shared && npx vitest run src/whatsapp"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// A spend no real or seeded customer reaches, so the audience is only this file's customers.
const HUGE = 1e14;

describe.skipIf(!enabled)('WhatsApp campaigns (Firestore emulator)', { timeout: 20_000 }, () => {
  let db: Firestore;
  const run = Math.random().toString(36).slice(2, 8);
  const phone = (n: number) => `+9197${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}${n}${n}`;
  const at = new Date().toISOString();
  const make = (name: string, marketing: 'opted_in' | 'opted_out' | null): Customer => {
    const c = newCustomer({ phone: phone(name.length % 10), name, source: 'admin' }, at);
    return {
      ...c,
      consent: { transactional: consent('opted_in', 'test', at), marketing: marketing ? consent(marketing, 'test', at) : c.consent.marketing },
      stats: { ...c.stats, totalSpent: HUGE, posPurchases: 1, lastPurchaseAt: at },
    };
  };
  const optedIn = make('Asha', 'opted_in');
  const changesMind = make('Bala Kumar', 'opted_in');
  const optedOut = make('Chitra S', 'opted_out');
  const neverAsked = make('Dev', null);

  beforeAll(async () => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
    // Leftovers from earlier runs share the HUGE spend: remove them first.
    const old = await db.collection('customers').where('stats.totalSpent', '>=', HUGE).get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
    await Promise.all([optedIn, changesMind, optedOut, neverAsked].map((c) => db.collection('customers').doc(c.id).set(c)));
  });

  it('picks only opted-in customers, freezes the list, re-checks consent at send time, and logs each message as marketing', async () => {
    const audience = { type: 'high_value' as const, minSpent: HUGE };
    const preview = await selectAudience(db, audience);
    expect(preview.recipients.map((c) => c.id).sort()).toEqual([optedIn.id, changesMind.id].sort());

    const id = `qa_campaign_${run}`;
    const campaign: Campaign = {
      id, name: 'QA offer', template: 'diwali_offer_2026', language: 'en', bodyParams: ['{{name}}', '20% off'], previewText: '',
      audience, status: 'draft', scheduledAt: null, counts: { targeted: 0, sent: 0, delivered: 0, read: 0, failed: 0, optedOut: 0 },
      createdBy: 'qa', createdAt: at, updatedAt: at, sentAt: null,
    };
    await db.collection('whatsappCampaigns').doc(id).set(campaign);

    expect(await startCampaign(db, id)).toBe(2);
    expect(await startCampaign(db, id)).toBe(0); // already started: nothing re-added

    // Bala replies STOP after the list was frozen but before the send.
    await db.collection('customers').doc(changesMind.id).update({ 'consent.marketing': consent('opted_out', 'whatsapp_reply', new Date().toISOString()) });

    const transport = new MockTransport();
    const wa = createWhatsAppService({ db, transport });
    const result = await sendCampaignBatch(db, wa, id);
    expect(result).toEqual({ sent: 1, skipped: 1, failed: 0, done: true });
    expect(transport.sent.map((s) => s.to)).toEqual([optedIn.phone]);
    expect(transport.sent[0].template).toBe('diwali_offer_2026');
    expect(JSON.stringify(transport.sent[0].components)).toContain('Asha'); // {{name}} → first name

    const saved = (await db.collection('whatsappCampaigns').doc(id).get()).data() as Campaign;
    expect(saved.status).toBe('sent');
    expect(saved.counts).toMatchObject({ targeted: 2, sent: 1, failed: 0 });
    const recipients = await db.collection('whatsappCampaigns').doc(id).collection('recipients').get();
    expect(Object.fromEntries(recipients.docs.map((d) => [d.id, d.get('status')]))).toEqual({ [optedIn.id]: 'sent', [changesMind.id]: 'skipped_opted_out' });

    const logs = await db.collection('whatsappMessages').where('related.id', '==', id).get();
    expect(logs.docs.map((d) => d.data() as WhatsAppMessage).map((m) => [m.category, m.customerId, m.status])).toEqual([['marketing', optedIn.id, 'sent']]);

    // Running the sender again (the scheduled job) sends nothing twice.
    expect(await sendCampaignBatch(db, wa, id)).toEqual({ sent: 0, skipped: 0, failed: 0, done: true });
    expect(transport.sent).toHaveLength(1);
  });
});
