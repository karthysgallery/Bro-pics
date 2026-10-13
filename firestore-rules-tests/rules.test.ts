// firestore-rules-tests/rules.test.ts
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'bro-pics-rules-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('products collection', () => {
  it('allows anyone to read', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('products/prod_1').set({ title: 'Frame' });
    });
    await assertSucceeds(unauth.firestore().doc('products/prod_1').get());
  });

  it('denies a direct client write', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('products/prod_1').set({ title: 'Hacked' }));
  });
});

describe('orders collection', () => {
  it('allows the owning user to read their own order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('orders/order_1').get());
  });

  it('denies a different user from reading someone else\'s order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('orders/order_1').get());
  });

  it('does not let staff read orders directly (only through the admin API, which needs the authenticator code)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertFails(staff.firestore().doc('orders/order_1').get());
  });

  it('denies any direct client write to an order', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertFails(userA.firestore().doc('orders/order_1').set({ userId: 'user_a' }));
  });
});

describe('reviews collection', () => {
  it('allows anyone to read an approved review', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('reviews/rev_1').set({ status: 'approved' });
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertSucceeds(unauth.firestore().doc('reviews/rev_1').get());
  });

  it('denies reading a pending review as an unauthenticated user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('reviews/rev_2').set({ status: 'pending' });
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('reviews/rev_2').get());
  });
});

describe('users collection', () => {
  it('allows the owning user to read and write their own profile fields', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    const db = userA.firestore();
    await assertSucceeds(db.doc('users/user_a').set({ displayName: 'A', firstName: 'A', updatedAt: new Date() }));
    await assertSucceeds(db.doc('users/user_a').get());
    await assertSucceeds(db.doc('users/user_a').set({ displayName: 'A2' }, { merge: true }));
  });

  it('allows creating a profile whose phone matches the verified phone_number claim', async () => {
    const userA = testEnv.authenticatedContext('user_a', { phone_number: '+919876543210' });
    await assertSucceeds(userA.firestore().doc('users/user_a').set({ id: 'user_a', phone: '+919876543210', displayName: 'A' }));
  });

  it('denies creating a profile with someone else\'s phone number (phone squatting)', async () => {
    const userA = testEnv.authenticatedContext('user_a', { phone_number: '+919876543210' });
    await assertFails(userA.firestore().doc('users/user_a').set({ phone: '+919999999999', displayName: 'A' }));
  });

  it('denies a customer from granting themselves a role or touching server-owned fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_a').set({ phone: '+919876543210', role: 'customer', totalSpent: 0, passwordHash: 'h' });
    });
    const db = testEnv.authenticatedContext('user_a').firestore();
    await assertFails(db.doc('users/user_a').set({ role: 'super_admin' }, { merge: true }));
    await assertFails(db.doc('users/user_a').set({ passwordHash: 'attacker' }, { merge: true }));
    await assertFails(db.doc('users/user_a').set({ totalSpent: 999999 }, { merge: true }));
    await assertFails(db.doc('users/user_a').set({ phone: '+919999999999' }, { merge: true }));
    await assertFails(db.doc('users/user_a').set({ disabled: false, status: 'active' }, { merge: true }));
  });

  it('still allows a merge that re-sends unchanged id/phone (what the profile page does)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_a').set({ id: 'user_a', phone: '+919876543210', role: 'customer' });
    });
    const db = testEnv.authenticatedContext('user_a').firestore();
    await assertSucceeds(
      db.doc('users/user_a').set({ id: 'user_a', phone: '+919876543210', displayName: 'New Name', updatedAt: new Date() }, { merge: true })
    );
  });

  it('denies deleting the profile doc from the client', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_a').set({ phone: '+91123' });
    });
    await assertFails(testEnv.authenticatedContext('user_a').firestore().doc('users/user_a').delete());
  });

  it('denies a different user from writing to someone else\'s profile', async () => {
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('users/user_a').set({ displayName: 'x' }));
  });

  it('lets staff neither read nor write another user\'s profile directly', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_a').set({ phone: '+91123' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    const db = staff.firestore();
    await assertFails(db.doc('users/user_a').get());
    await assertFails(db.doc('users/user_a').set({ displayName: 'x' }));
  });
});

describe('super_admin role', () => {
  it('cannot read orders or users directly either — the owner uses the admin API too', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const seedDb = ctx.firestore();
      await seedDb.doc('orders/order_1').set({ userId: 'user_a' });
      await seedDb.doc('users/user_a').set({ phone: '+91123' });
    });
    const db = testEnv.authenticatedContext('owner', { role: 'super_admin' }).firestore();
    await assertFails(db.doc('orders/order_1').get());
    await assertFails(db.doc('users/user_a').get());
    await assertFails(db.doc('orders/order_1').set({ userId: 'x' }));
  });

  it('a content_manager still cannot read orders', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const cm = testEnv.authenticatedContext('cm', { role: 'content_manager' });
    await assertFails(cm.firestore().doc('orders/order_1').get());
  });
});

describe('users/{userId}/addresses subcollection', () => {
  it('allows the owning user to read and write their own address', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('users/user_a/addresses/addr_1').set({ city: 'Chennai' }));
  });

  it('denies a different user from writing to someone else\'s address', async () => {
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('users/user_a/addresses/addr_1').set({ city: 'Hacked' }));
  });
});

describe('carts collection', () => {
  it('allows the owning user to read and write their own cart', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    const db = userA.firestore();
    await assertSucceeds(db.doc('carts/user_a').set({ items: [] }));
    await assertSucceeds(db.doc('carts/user_a').get());
  });

  it('denies a different user from reading or writing someone else\'s cart', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('carts/user_a').set({ items: [] });
    });
    const userB = testEnv.authenticatedContext('user_b');
    const db = userB.firestore();
    await assertFails(db.doc('carts/user_a').get());
    await assertFails(db.doc('carts/user_a').set({ items: [] }));
  });

  it('denies an unauthenticated read or write', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('carts/user_a').get());
  });

  function validLine(overrides: Record<string, unknown> = {}) {
    return {
      variantId: 'var_1',
      personalizationId: 'pers_1',
      title: 'Classic Wooden Frame',
      unitPriceSnapshot: 79900,
      qty: 2,
      ...overrides,
    };
  }

  it('allows a well-formed cart with items', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('carts/user_a').set({ items: [validLine()] }));
  });

  it('denies a write whose items field is not a list at all', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertFails(userA.firestore().doc('carts/user_a').set({ items: 'not-a-list' }));
  });

  it('denies more than 50 line items [BE-09] — Firestore rules can bound list size, but not validate each element (no .all()/.map() macro; per-item qty/shape bounds live in create-order instead)', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    const items = Array.from({ length: 51 }, (_, i) => validLine({ personalizationId: `pers_${i}` }));
    await assertFails(userA.firestore().doc('carts/user_a').set({ items }));
  });

  it('allows exactly 50 line items', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    const items = Array.from({ length: 50 }, (_, i) => validLine({ personalizationId: `pers_${i}` }));
    await assertSucceeds(userA.firestore().doc('carts/user_a').set({ items }));
  });
});

describe('customizations collection', () => {
  it('allows the owning user to read their own customization', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('customizations/c1').set({ userId: 'user_a' });
    });
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('customizations/c1').get());
  });

  it('denies a different user from reading someone else\'s customization', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('customizations/c1').set({ userId: 'user_a' });
    });
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('customizations/c1').get());
  });

  it('does not let staff read customizations directly', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('customizations/c1').set({ userId: 'user_a' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertFails(staff.firestore().doc('customizations/c1').get());
  });
});

describe('personalizationTemplates', () => {
  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('personalizationTemplates/t1').set({ id: 't1', name: 'T1' });
      await db.doc('personalizationTemplates/t1/versions/1').set({ status: 'published' });
      await db.doc('personalizationTemplates/t1/versions/2').set({ status: 'draft' });
      await db.doc('personalizationTemplates/t1/versions/3').set({ status: 'review' });
      await db.doc('personalizationTemplates/t1/versions/4').set({ status: 'archived' });
    });
  }

  it('lets anyone read published and archived versions (so saved carts/orders still open their design)', async () => {
    await seed();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.doc('personalizationTemplates/t1/versions/1').get());
    await assertSucceeds(anon.doc('personalizationTemplates/t1/versions/4').get());
  });

  it('hides drafts and in-review versions from customers and anonymous visitors', async () => {
    await seed();
    const customer = testEnv.authenticatedContext('user_a').firestore();
    await assertFails(customer.doc('personalizationTemplates/t1/versions/2').get());
    await assertFails(customer.doc('personalizationTemplates/t1/versions/3').get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('personalizationTemplates/t1/versions/2').get());
  });

  it('keeps the admin summary list off the client entirely (staff read it through the admin API)', async () => {
    await seed();
    await assertFails(testEnv.authenticatedContext('user_a').firestore().doc('personalizationTemplates/t1').get());
    await assertFails(testEnv.authenticatedContext('s', { role: 'staff' }).firestore().doc('personalizationTemplates/t1').get());
  });

  it('lets nobody — not even an admin — read drafts or write from the client', async () => {
    await seed();
    const admin = testEnv.authenticatedContext('a', { role: 'super_admin' }).firestore();
    await assertFails(admin.doc('personalizationTemplates/t1/versions/2').get());
    await assertFails(admin.doc('personalizationTemplates/t1/versions/2').set({ status: 'published' }));
    await assertFails(testEnv.authenticatedContext('user_a').firestore().doc('personalizationTemplates/t9').set({ x: 1 }));
  });
});


// Sign-in secrets and server-only lists have no rule at all: every browser, even a signed-in super admin, is refused.
describe.each(['staffMfa', 'staffPasskeys', 'staffPasskeyChallenges', 'priceLists', 'frameModels', 'variantCosts'])('%s is server-only', (collection) => {
  const contexts = (): Array<[string, ReturnType<RulesTestEnvironment['authenticatedContext']>]> => [
    ['a customer', testEnv.authenticatedContext('user_a')],
    ['staff', testEnv.authenticatedContext('staff_a', { role: 'staff' })],
    ['a super admin', testEnv.authenticatedContext('admin_a', { role: 'super_admin' })],
  ];
  it('refuses reads and writes from a customer, staff and a super admin, and from a signed-out browser', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${collection}/x`).set({ secret: 'value', uid: 'staff_a' });
    });
    const all = [...contexts().map(([, c]) => c), testEnv.unauthenticatedContext()];
    for (const c of all) {
      const db = c.firestore(); // once per context: a second call would try to change its settings
      await assertFails(db.doc(`${collection}/x`).get());
      await assertFails(db.doc(`${collection}/x`).set({ secret: 'changed' }));
      await assertFails(db.collection(collection).where('uid', '==', 'staff_a').get());
    }
  });
});
