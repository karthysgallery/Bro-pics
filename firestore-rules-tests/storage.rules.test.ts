// firestore-rules-tests/storage.rules.test.ts
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ref, uploadString, getBytes } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

async function seedFile(path: string, content = 'fake-bytes'): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage(), path), content);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'bro-pics-rules-test',
    storage: {
      rules: readFileSync('../storage.rules', 'utf8'),
      host: 'localhost',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

describe('public/ (product photography, CMS assets)', () => {
  it('allows anyone, including an unauthenticated caller, to read', async () => {
    await seedFile('public/products/frame-1.jpg');
    const unauth = testEnv.unauthenticatedContext();
    await assertSucceeds(getBytes(ref(unauth.storage(), 'public/products/frame-1.jpg')));
  });

  it('allows a signed-in owner-role caller to read too', async () => {
    await seedFile('public/cms/hero-banner.jpg');
    const user = testEnv.authenticatedContext('user_1');
    await assertSucceeds(getBytes(ref(user.storage(), 'public/cms/hero-banner.jpg')));
  });

  it('denies a direct client write, even from staff', async () => {
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertFails(uploadString(ref(staff.storage(), 'public/products/hacked.jpg'), 'evil'));
  });
});

describe('uploads/ (customer photos and previews — private)', () => {
  it('denies the uploading customer direct client read access — GET /api/media/url is the only sanctioned read path', async () => {
    await seedFile('uploads/sess_1/up_1/original.jpg');
    // Even the customer who is unambiguously "the owner" in the app's own
    // model has no direct Storage-rules-verifiable ownership here (paths
    // are keyed by sessionId, not a Firebase Auth uid), which is exactly
    // why the app never issues a direct client SDK read for this prefix.
    const owner = testEnv.authenticatedContext('user_1');
    await assertFails(getBytes(ref(owner.storage(), 'uploads/sess_1/up_1/original.jpg')));
  });

  it('denies an unauthenticated (anonymous) caller', async () => {
    await seedFile('uploads/sess_1/up_1/original.jpg');
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getBytes(ref(anon.storage(), 'uploads/sess_1/up_1/original.jpg')));
  });

  it('denies a non-owner, non-staff signed-in caller', async () => {
    await seedFile('uploads/sess_1/up_1/original.jpg');
    const other = testEnv.authenticatedContext('user_2');
    await assertFails(getBytes(ref(other.storage(), 'uploads/sess_1/up_1/original.jpg')));
  });

  it('allows staff to read directly, for fulfillment', async () => {
    await seedFile('uploads/sess_1/up_1/original.jpg');
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(getBytes(ref(staff.storage(), 'uploads/sess_1/up_1/original.jpg')));
  });

  it('allows admin to read directly', async () => {
    await seedFile('uploads/sess_1/up_1/original.jpg');
    const admin = testEnv.authenticatedContext('admin_1', { role: 'admin' });
    await assertSucceeds(getBytes(ref(admin.storage(), 'uploads/sess_1/up_1/original.jpg')));
  });

  it('denies any direct client write', async () => {
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertFails(uploadString(ref(staff.storage(), 'uploads/sess_1/up_1/original.jpg'), 'evil'));
  });
});

describe('print-files/ (server-rendered 300 DPI output — private)', () => {
  it('denies a regular signed-in customer', async () => {
    await seedFile('print-files/order_1/item_1/print.png');
    const user = testEnv.authenticatedContext('user_1');
    await assertFails(getBytes(ref(user.storage(), 'print-files/order_1/item_1/print.png')));
  });

  it('allows staff to read, for quality check', async () => {
    await seedFile('print-files/order_1/item_1/print.png');
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(getBytes(ref(staff.storage(), 'print-files/order_1/item_1/print.png')));
  });
});

describe('returns/ (customer-submitted return evidence photos — private)', () => {
  it('denies an unauthenticated caller', async () => {
    await seedFile('returns/return_1/evidence-1.jpg');
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getBytes(ref(anon.storage(), 'returns/return_1/evidence-1.jpg')));
  });

  it('allows staff to read, for return review', async () => {
    await seedFile('returns/return_1/evidence-1.jpg');
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(getBytes(ref(staff.storage(), 'returns/return_1/evidence-1.jpg')));
  });
});

describe('anything outside the declared prefixes', () => {
  it('denies read and write unconditionally, even for admin', async () => {
    await seedFile('some-unexpected-path/file.txt');
    const admin = testEnv.authenticatedContext('admin_1', { role: 'admin' });
    await assertFails(getBytes(ref(admin.storage(), 'some-unexpected-path/file.txt')));
    await assertFails(uploadString(ref(admin.storage(), 'some-unexpected-path/file.txt'), 'x'));
  });
});
