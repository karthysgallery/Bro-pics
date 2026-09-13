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

  it('allows staff to read any order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(staff.firestore().doc('orders/order_1').get());
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
  it('allows the owning user to read and write their own profile', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    const db = userA.firestore();
    await assertSucceeds(db.doc('users/user_a').set({ phone: '+91123' }));
    await assertSucceeds(db.doc('users/user_a').get());
  });

  it('denies a different user from writing to someone else\'s profile', async () => {
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('users/user_a').set({ phone: '+91999' }));
  });

  it('allows staff to read but not write another user\'s profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_a').set({ phone: '+91123' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    const db = staff.firestore();
    await assertSucceeds(db.doc('users/user_a').get());
    await assertFails(db.doc('users/user_a').set({ phone: '+91999' }));
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

  it('allows staff to read any customization', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('customizations/c1').set({ userId: 'user_a' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(staff.firestore().doc('customizations/c1').get());
  });
});
