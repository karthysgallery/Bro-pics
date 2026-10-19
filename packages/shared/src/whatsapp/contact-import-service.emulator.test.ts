import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { buildPlan, commitImport, IMPORTS, PlanChangedError, summarise } from './contact-import-service';
import { recordMarketingOptOut, SUPPRESSIONS } from './consent';
import { selectAudience } from './campaigns';
import type { Customer } from '../schemas/billing';

// Real Firestore (emulator):  firebase emulators:exec --only firestore "cd packages/shared && npx vitest run src/whatsapp"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const NOW = new Date('2026-10-18T00:00:00Z');
const HEAD = 'name,phone,city,marketing_consent,consent_source,consent_at,consent_evidence,policy_version\n';

describe.skipIf(!enabled)('contact import (Firestore emulator, synthetic numbers only)', { timeout: 30_000 }, () => {
  let db: Firestore;
  beforeAll(() => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
  });
  beforeEach(async () => {
    const ids = ['p919000000101', 'p919000000102', 'p919000000103'];
    await Promise.all(ids.flatMap((id) => [db.collection('customers').doc(id).delete(), db.collection(SUPPRESSIONS).doc(id).delete()]));
    for (const d of (await db.collection(IMPORTS).get()).docs) await d.ref.delete();
  });
  // Synthetic numbers in a range no real customer uses: 91990xxxxx style is not a valid mobile, so use 9000000xxx.
  const csv = HEAD + 'Test One,9000000101,Madurai,,,,,\nTest Two,9000000102,Chennai,opted_in,signup form,2026-01-15,Form 7,v1\nTest Three,9000000103,,opted_in,,,,\n';

  it('a preview writes nothing; the import creates customers with consent unknown unless evidence exists', async () => {
    const plan = await buildPlan(db, csv, 'skip_existing', NOW);
    expect(summarise(plan).counts).toMatchObject({ create: 3, consentOptedIn: 1, consentUnknown: 2 });
    expect((await db.collection('customers').doc('p919000000101').get()).exists).toBe(false);

    const result = await commitImport(db, { csv, strategy: 'skip_existing', actorUid: 'admin_1', expect: { create: 3, update: 0 }, now: NOW });
    expect(result.created).toBe(3);
    const one = (await db.collection('customers').doc('p919000000101').get()).data() as Customer;
    expect(one.consent.marketing.status).toBe('unknown');
    const two = (await db.collection('customers').doc('p919000000102').get()).data() as Customer;
    expect(two.consent.marketing).toMatchObject({ status: 'opted_in', source: 'signup form', evidence: 'Form 7', policyVersion: 'v1' });
    const three = (await db.collection('customers').doc('p919000000103').get()).data() as Customer;
    expect(three.consent.marketing.status).toBe('unknown'); // claimed opted in with no evidence
    // the import record holds counts only
    const job = (await db.collection(IMPORTS).doc(result.importId).get()).data()!;
    expect(JSON.stringify(job)).not.toMatch(/9000000101|Test One|Form 7/);
  });

  it('only the customer with evidence can be chosen for a marketing campaign', async () => {
    await commitImport(db, { csv, strategy: 'skip_existing', actorUid: 'a', expect: { create: 3, update: 0 }, now: NOW });
    const { recipients } = await selectAudience(db, { type: 'all_opted_in' });
    const mine = recipients.filter((c) => c.phone.startsWith('+919000000'));
    expect(mine.map((c) => c.phone)).toEqual(['+919000000102']);
  });

  it('re-importing never erases an opt-out and does not duplicate customers', async () => {
    await commitImport(db, { csv, strategy: 'skip_existing', actorUid: 'a', expect: { create: 3, update: 0 }, now: NOW });
    await recordMarketingOptOut(db, { phone: '+919000000102', source: 'whatsapp_reply', nowIso: NOW.toISOString() });
    const plan = await buildPlan(db, csv, 'update_details', NOW);
    expect(plan.counts.create).toBe(0);
    const again = await commitImport(db, { csv, strategy: 'update_details', actorUid: 'a', expect: { create: 0, update: plan.counts.update }, now: NOW });
    expect(again.created).toBe(0);
    const two = (await db.collection('customers').doc('p919000000102').get()).data() as Customer;
    expect(two.consent.marketing.status).toBe('opted_out');
    expect((await db.collection(SUPPRESSIONS).doc('p919000000102').get()).exists).toBe(true);
  });

  it('refuses to write when the database changed since the preview', async () => {
    await expect(commitImport(db, { csv, strategy: 'skip_existing', actorUid: 'a', expect: { create: 1, update: 0 }, now: NOW })).rejects.toBeInstanceOf(PlanChangedError);
    expect((await db.collection('customers').doc('p919000000101').get()).exists).toBe(false);
  });

  it('a file with a bad header writes nothing', async () => {
    await expect(commitImport(db, { csv: 'x,y\n1,2\n', strategy: 'skip_existing', actorUid: 'a', expect: { create: 0, update: 0 }, now: NOW })).rejects.toThrow(/Missing/);
  });
});
