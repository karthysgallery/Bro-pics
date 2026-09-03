# Phase 4 Plan A — Accounts & Cart Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase phone-OTP accounts, a `User`/`Address` schema, and real cart persistence, and reconcile Phase 3's anonymous `sessionId`-owned uploads/customizations to the logged-in user at login.

**Architecture:** New zod schemas in `packages/shared` for `User`/`Address` and a `userId` field on `Upload`/`Customization`; `firestore.rules` gains owner-based read/write for `users`, `addresses`, and `carts/{userId}` (the first phase with a verifiable `request.auth.uid`); a Firebase Auth phone-OTP sign-in flow feeding a `useAuth()` hook; a single Cloud Functions `onCall` (`reconcileSessionOnLogin`) that atomically reassigns session-owned uploads/customizations, merges the local cart into Firestore, and upserts the user profile; `CartProvider` gains a Firestore-backed mode used only when signed in, falling back to today's local-only state when signed out.

**Tech Stack:** Firebase Auth (phone provider, client SDK `firebase/auth`), Cloud Functions v2 `onCall` (`firebase-functions/v2/https`), Firestore Admin SDK transactions, zod, React Context, Next.js App Router, Vitest, `@firebase/rules-unit-testing`.

## Global Constraints

- No custom claims / role assignment in this plan — every account is implicitly a customer; `admin`/`staff` claims are Phase 5's concern and `isStaffOrAdmin()` is untouched.
- No guest checkout — login is required before checkout (enforced in Plan B, not here).
- Cart stays local-only (React state) until login; it is never written to Firestore before that point.
- `uploads`/`customizations` writes stay server-only (Admin SDK) — only their *read* rules change in this plan.
- Address management UI is out of scope — only the `AddressSchema` is defined here, for Plan B to build on.
- Firebase config for local/live dev already exists at `apps/web/.env.local` (gitignored) — no new credentials needed.

---

### Task 1: `UserSchema` and `AddressSchema`

**Files:**
- Create: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/schemas/address.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/user.test.ts`
- Test: `packages/shared/src/schemas/address.test.ts`

**Interfaces:**
- Produces: `UserSchema`, `type User` (fields: `id`, `phone`, `email`, `displayName`, `createdAt`, `updatedAt`); `AddressSchema`, `type Address` (fields: `id`, `label`, `line1`, `line2`, `city`, `state`, `pincode`, `phone`, `isDefault`). Both exported from `@bro-pics/shared`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/schemas/user.test.ts
import { describe, it, expect } from 'vitest';
import { UserSchema } from './user';

describe('UserSchema', () => {
  it('accepts a full valid user', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: 'a@example.com',
      displayName: 'Karthik',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null email and displayName', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: null,
      displayName: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing phone', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      email: null,
      displayName: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
```

```ts
// packages/shared/src/schemas/address.test.ts
import { describe, it, expect } from 'vitest';
import { AddressSchema } from './address';

describe('AddressSchema', () => {
  it('accepts a full valid address', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: 'Home',
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      phone: '+919876543210',
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing pincode', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: null,
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      phone: '+919876543210',
      isDefault: true,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `Cannot find module './user'` / `'./address'`

- [ ] **Step 3: Write the schemas**

```ts
// packages/shared/src/schemas/user.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;
```

```ts
// packages/shared/src/schemas/address.ts
import { z } from 'zod';

export const AddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(1),
  phone: z.string().min(1),
  isDefault: z.boolean(),
});

export type Address = z.infer<typeof AddressSchema>;
```

```ts
// packages/shared/src/index.ts — add these two lines near the other schema exports
export * from './schemas/user';
export * from './schemas/address';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/user.ts packages/shared/src/schemas/address.ts packages/shared/src/schemas/user.test.ts packages/shared/src/schemas/address.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add User and Address schemas"
```

---

### Task 2: `mergeCartItems` pure merge logic

**Files:**
- Create: `packages/shared/src/cart/merge-cart-items.ts`
- Test: `packages/shared/src/cart/merge-cart-items.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `mergeCartItems(existing: CartLine[], incoming: CartLine[]): CartLine[]` and `type CartLine = { variantId: string; personalizationId: string; title: string; unitPriceSnapshot: number; qty: number; previewUrl?: string }`, exported from `@bro-pics/shared`. Task 5 (`reconcileSessionOnLogin`) and Task 7 (Firestore-backed `CartProvider`) both import this. `CartLine` is the schema-side mirror of `apps/web/lib/cart-context.tsx`'s `CartItem` (Task 6 adds `previewUrl` to `CartItem` to match).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/cart/merge-cart-items.test.ts
import { describe, it, expect } from 'vitest';
import { mergeCartItems } from './merge-cart-items';

describe('mergeCartItems', () => {
  it('sums qty for matching (variantId, personalizationId) pairs', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 2 }];
    const incoming = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 3 }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toEqual([{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 5 }]);
  });

  it('keeps non-matching lines from both sides', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 1 }];
    const incoming = [{ variantId: 'v2', personalizationId: 'p2', title: 'Frame B', unitPriceSnapshot: 2000, qty: 1 }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([existing[0], incoming[0]]));
  });

  it('prefers the incoming line\'s previewUrl and title when merging', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Old Title', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'old.png' }];
    const incoming = [{ variantId: 'v1', personalizationId: 'p1', title: 'New Title', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'new.png' }];
    const result = mergeCartItems(existing, incoming);
    expect(result).toEqual([{ variantId: 'v1', personalizationId: 'p1', title: 'New Title', unitPriceSnapshot: 1000, qty: 2, previewUrl: 'new.png' }]);
  });

  it('returns existing unchanged when incoming is empty', () => {
    const existing = [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame A', unitPriceSnapshot: 1000, qty: 4 }];
    expect(mergeCartItems(existing, [])).toEqual(existing);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `Cannot find module './merge-cart-items'`

- [ ] **Step 3: Write the minimal implementation**

```ts
// packages/shared/src/cart/merge-cart-items.ts
export interface CartLine {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
  previewUrl?: string;
}

function lineKey(line: CartLine): string {
  return `${line.variantId}::${line.personalizationId}`;
}

/**
 * Merges two cart-line lists, summing qty for matching
 * (variantId, personalizationId) pairs. Used both when reconciling a local
 * cart into an existing Firestore cart at login (a returning user signing
 * in on a second device) and, potentially, by any future client-side merge
 * path. The incoming line's title/previewUrl/unitPriceSnapshot win on a
 * match — incoming is always the more recently-added data.
 */
export function mergeCartItems(existing: CartLine[], incoming: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of existing) merged.set(lineKey(line), line);
  for (const line of incoming) {
    const current = merged.get(lineKey(line));
    merged.set(lineKey(line), current ? { ...line, qty: current.qty + line.qty } : line);
  }
  return [...merged.values()];
}
```

```ts
// packages/shared/src/index.ts — add
export * from './cart/merge-cart-items';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/cart/merge-cart-items.ts packages/shared/src/cart/merge-cart-items.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add mergeCartItems pure cart-merge logic"
```

---

### Task 3: `userId` on uploads/customizations, `firestore.rules`, rules tests

**Files:**
- Modify: `packages/shared/src/schemas/upload.ts`
- Modify: `packages/shared/src/schemas/customization.ts`
- Modify: `firestore.rules`
- Modify: `firestore-rules-tests/rules.test.ts`
- Test: `packages/shared/src/schemas/upload.test.ts` (new, schema-level — no test file existed for this schema before)
- Test: `packages/shared/src/schemas/customization.test.ts` (new, same reason)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Upload`/`Customization` types gain optional `userId: string | undefined`, consumed by Task 5's reconciliation logic and Task 7's Firestore-backed cart mode's rule expectations. `firestore.rules` gains `carts/{userId}` (renamed from `carts/{sessionId}`), consumed by Task 5 and Task 7.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/schemas/upload.test.ts
import { describe, it, expect } from 'vitest';
import { UploadSchema } from './upload';

describe('UploadSchema', () => {
  it('accepts an upload with no userId (pre-login)', () => {
    const result = UploadSchema.safeParse({
      id: 'up_1', sessionId: 'sess_1', originalUrl: 'https://x/y.jpg',
      widthPx: 4000, heightPx: 3000, mime: 'image/jpeg', bytes: 123456,
      exifStripped: true, status: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an upload with userId set (post-reconciliation)', () => {
    const result = UploadSchema.safeParse({
      id: 'up_1', sessionId: 'sess_1', userId: 'user_1', originalUrl: 'https://x/y.jpg',
      widthPx: 4000, heightPx: 3000, mime: 'image/jpeg', bytes: 123456,
      exifStripped: true, status: 'ready',
    });
    expect(result.success).toBe(true);
  });
});
```

```ts
// packages/shared/src/schemas/customization.test.ts
import { describe, it, expect } from 'vitest';
import { CustomizationSchema } from './customization';

function baseCustomization(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', sessionId: 'sess_1', personalizationId: 'p1', uploadId: 'up_1',
    variantId: 'v1', slotIndex: 0,
    transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
    effectiveDpi: 300, renderStatus: 'done',
    ...overrides,
  };
}

describe('CustomizationSchema', () => {
  it('accepts a customization with no userId (pre-login)', () => {
    expect(CustomizationSchema.safeParse(baseCustomization()).success).toBe(true);
  });

  it('accepts a customization with userId set (post-reconciliation)', () => {
    expect(CustomizationSchema.safeParse(baseCustomization({ userId: 'user_1' })).success).toBe(true);
  });
});
```

```ts
// firestore-rules-tests/rules.test.ts — ADD these describe blocks at the end of the file
describe('users collection', () => {
  it('allows the owning user to read and write their own profile', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('users/user_a').set({ phone: '+91123' }));
    await assertSucceeds(userA.firestore().doc('users/user_a').get());
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
    await assertSucceeds(staff.firestore().doc('users/user_a').get());
    await assertFails(staff.firestore().doc('users/user_a').set({ phone: '+91999' }));
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
    await assertSucceeds(userA.firestore().doc('carts/user_a').set({ items: [] }));
    await assertSucceeds(userA.firestore().doc('carts/user_a').get());
  });

  it('denies a different user from reading or writing someone else\'s cart', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('carts/user_a').set({ items: [] });
    });
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('carts/user_a').get());
    await assertFails(userB.firestore().doc('carts/user_a').set({ items: [] }));
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test` — FAIL on schema tests only if userId parse were rejected (it will actually PASS on the "no userId" cases since the field doesn't exist yet and isn't required; run it anyway to confirm the baseline, then proceed — the meaningful failing check is the rules tests).
Run: `cd firestore-rules-tests && pnpm test`
Expected: FAIL — `carts/user_a` denied for its owner, `users/user_a` write denied, `customizations/c1` denied for owner.

- [ ] **Step 3: Add `userId` to both schemas**

```ts
// packages/shared/src/schemas/upload.ts — add one line to the object
export const UploadSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  userId: z.string().min(1).optional(),
  originalUrl: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  exifStripped: z.boolean(),
  status: z.enum(['ready', 'rejected']),
});
```

```ts
// packages/shared/src/schemas/customization.ts — add one line
export const CustomizationSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  userId: z.string().min(1).optional(),
  personalizationId: z.string().min(1),
  // ...rest unchanged
```

- [ ] **Step 4: Update `firestore.rules`**

```
    match /customizations/{id} {
      allow read: if isOwner(resource.data.userId) || isStaffOrAdmin();
      allow write: if false;
    }

    match /users/{userId} {
      allow read: if isOwner(userId) || isStaffOrAdmin();
      allow write: if isOwner(userId);

      match /addresses/{addressId} {
        allow read: if isOwner(userId) || isStaffOrAdmin();
        allow write: if isOwner(userId);
      }
    }
```

```
    match /carts/{userId} {
      allow read, write: if isOwner(userId);
    }
```

(Replace the existing `match /customizations/{id}`, `match /users/{userId}`, and `match /carts/{sessionId}` blocks with the above — `uploads/{uploadId}`'s rule at lines 78-81 needs no change, it already checks `isOwner(resource.data.userId)`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS
Run: `cd firestore-rules-tests && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/upload.ts packages/shared/src/schemas/customization.ts packages/shared/src/schemas/upload.test.ts packages/shared/src/schemas/customization.test.ts firestore.rules firestore-rules-tests/rules.test.ts
git commit -m "feat: add userId ownership field and owner-based Firestore rules for users/carts/customizations"
```

---

### Task 4: Phone-OTP sign-in UI and `useAuth()` hook

**Files:**
- Create: `apps/web/lib/auth-context.tsx`
- Create: `apps/web/components/auth/PhoneSignIn.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/lib/auth-context.test.tsx`
- Test: `apps/web/components/auth/PhoneSignIn.test.tsx`

**Interfaces:**
- Consumes: `getFirebaseApp()` from `apps/web/lib/firebase-client.ts` (existing).
- Produces: `AuthProvider` (React component), `useAuth(): { user: FirebaseUser | null, loading: boolean }` (exported from `auth-context.tsx`), consumed by Task 7's `CartProvider`. `PhoneSignIn` component exposes an `onSignedIn: (user: FirebaseUser) => void` prop, fired after successful OTP verification — Task 7 wires this callback to invoke `reconcileSessionOnLogin` (Task 5).

> **Manual checkpoint before this task can be verified live:** the Phone sign-in provider must be enabled in the Firebase Console (Authentication → Sign-in method → Phone) and at least one test phone number + fixed OTP registered (Authentication → Sign-in method → Phone numbers for testing) for the `bropics-app` project. This is a console click-through, not something a task can do unattended — ask the user to do this before Step 6 (live verification) below; unit tests (Steps 1-5) do not need it.

- [ ] **Step 1: Write the failing test for `useAuth()`**

```tsx
// apps/web/lib/auth-context.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
}));

function Probe() {
  const { user, loading } = useAuth();
  return <div data-testid="probe">{loading ? 'loading' : user ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider / useAuth', () => {
  it('reports signed-out once the auth listener resolves with no user', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- auth-context`
Expected: FAIL — `Cannot find module './auth-context'`

- [ ] **Step 3: Implement `auth-context.tsx`**

```tsx
// apps/web/lib/auth-context.tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getFirebaseApp } from './firebase-client';

interface AuthContextValue {
  user: FirebaseUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(getFirebaseApp());
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- auth-context`
Expected: PASS

- [ ] **Step 5: Write the failing test for `PhoneSignIn`**

```tsx
// apps/web/components/auth/PhoneSignIn.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneSignIn } from './PhoneSignIn';

const mockConfirm = vi.fn();
const mockSignInWithPhoneNumber = vi.fn(() => Promise.resolve({ confirm: mockConfirm }));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  RecaptchaVerifier: vi.fn().mockImplementation(() => ({ clear: vi.fn() })),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('PhoneSignIn', () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockSignInWithPhoneNumber.mockClear();
  });

  it('sends an OTP, then verifies it and calls onSignedIn', async () => {
    mockConfirm.mockResolvedValue({ user: { uid: 'user_1' } });
    const onSignedIn = vi.fn();
    render(<PhoneSignIn onSignedIn={onSignedIn} />);

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

    fireEvent.change(await screen.findByLabelText('Enter OTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ uid: 'user_1' }));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- PhoneSignIn`
Expected: FAIL — `Cannot find module './PhoneSignIn'`

- [ ] **Step 7: Implement `PhoneSignIn.tsx`**

```tsx
// apps/web/components/auth/PhoneSignIn.tsx
'use client';

import { useRef, useState } from 'react';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseApp } from '../../lib/firebase-client';

interface PhoneSignInProps {
  onSignedIn: (user: FirebaseUser) => void;
}

export function PhoneSignIn({ onSignedIn }: PhoneSignInProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  const handleSendOtp = async () => {
    setError(null);
    try {
      const auth = getAuth(getFirebaseApp());
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current!, { size: 'invisible' });
      const result = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmationResult(result);
    } catch {
      setError('Could not send OTP. Check the phone number and try again.');
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!confirmationResult) return;
    try {
      const credential = await confirmationResult.confirm(otp);
      onSignedIn(credential.user);
    } catch {
      setError('Incorrect OTP. Try again.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!confirmationResult ? (
        <>
          <label htmlFor="phone-input">Phone number</label>
          <input
            id="phone-input"
            aria-label="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91XXXXXXXXXX"
            className="rounded border border-charcoal/20 px-3 py-2"
          />
          <button onClick={handleSendOtp} className="rounded bg-charcoal text-cream px-4 py-2">
            Send OTP
          </button>
        </>
      ) : (
        <>
          <label htmlFor="otp-input">Enter OTP</label>
          <input
            id="otp-input"
            aria-label="Enter OTP"
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="rounded border border-charcoal/20 px-3 py-2"
          />
          <button onClick={handleVerifyOtp} className="rounded bg-charcoal text-cream px-4 py-2">
            Verify
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div ref={recaptchaContainerRef} />
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- PhoneSignIn`
Expected: PASS

- [ ] **Step 9: Wire `AuthProvider` into the root layout**

```tsx
// apps/web/app/layout.tsx — modify the import and the JSX
import { AuthProvider } from '../lib/auth-context';
// ...
      <body className="bg-cream text-charcoal font-sans">
        <AuthProvider>
          <CartProvider>
            <LayoutChrome categories={categories} announcementBar={announcementBar}>
              {children}
            </LayoutChrome>
          </CartProvider>
        </AuthProvider>
      </body>
```

- [ ] **Step 10: Run the full web test suite to confirm nothing broke**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (existing `layout.test.tsx` and `cart-context.test.tsx` etc. still pass — `AuthProvider` wraps `CartProvider`, but `CartProvider`'s own tests render `<CartProvider>` standalone without `AuthProvider`, which is fine since Task 7, not this task, is what makes `CartProvider` depend on `useAuth()`)

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/auth-context.tsx apps/web/lib/auth-context.test.tsx apps/web/components/auth/PhoneSignIn.tsx apps/web/components/auth/PhoneSignIn.test.tsx apps/web/app/layout.tsx
git commit -m "feat(web): add phone-OTP sign-in UI and useAuth hook"
```

---

### Task 5: `reconcileSessionOnLogin` Cloud Function

**Files:**
- Create: `functions/src/accounts/reconcile-session.ts`
- Test: `functions/src/accounts/reconcile-session.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `mergeCartItems`, `type CartLine` from `@bro-pics/shared` (Task 2); `Upload`, `Customization` types with optional `userId` (Task 3); `firestore.rules`'s `carts/{userId}` and `users/{userId}` paths (Task 3).
- Produces: `runReconciliation(deps, params): Promise<void>` — the pure, injectable-transaction core logic, unit tested with fakes (same pattern as `generateOrderNo`/`isDuplicateWebhookEvent`). `reconcileSessionOnLogin` — the thin `onCall` Cloud Function wrapping it with the real Admin SDK, exported from `functions/src/index.ts`. Consumed by Task 7 (client calls it via `httpsCallable`).

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/accounts/reconcile-session.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runReconciliation } from './reconcile-session';
import type { ReconciliationTransaction } from './reconcile-session';

function makeFakeTransaction(opts: {
  matchedUploads: Array<{ id: string }>;
  matchedCustomizations: Array<{ id: string }>;
  existingCart: { items: unknown[] } | undefined;
  userAlreadyExists?: boolean;
}): ReconciliationTransaction {
  return {
    getUploadsBySessionId: vi.fn().mockResolvedValue(opts.matchedUploads),
    getCustomizationsBySessionId: vi.fn().mockResolvedValue(opts.matchedCustomizations),
    setUploadUserId: vi.fn(),
    setCustomizationUserId: vi.fn(),
    getCart: vi.fn().mockResolvedValue(opts.existingCart),
    setCart: vi.fn(),
    userExists: vi.fn().mockResolvedValue(opts.userAlreadyExists ?? false),
    upsertUser: vi.fn(),
  };
}

describe('runReconciliation', () => {
  it('reassigns every matched upload and customization to the userId', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [{ id: 'up_1' }, { id: 'up_2' }],
      matchedCustomizations: [{ id: 'c_1' }],
      existingCart: undefined,
    });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.setUploadUserId).toHaveBeenCalledWith('up_1', 'user_1');
    expect(tx.setUploadUserId).toHaveBeenCalledWith('up_2', 'user_1');
    expect(tx.setCustomizationUserId).toHaveBeenCalledWith('c_1', 'user_1');
  });

  it('merges the incoming cart into an existing cart by summing qty', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [],
      matchedCustomizations: [],
      existingCart: { items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 2 }] },
    });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 3 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', {
      items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 5 }],
    });
  });

  it('writes the incoming cart as-is when no cart exists yet', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', { items: incomingCartItems });
  });

  it('upserts a first-time user profile with isNewUser true', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: false });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', true);
  });

  it('upserts a returning user profile with isNewUser false', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: true });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test -- reconcile-session`
Expected: FAIL — `Cannot find module './reconcile-session'`

- [ ] **Step 3: Write the minimal implementation**

```ts
// functions/src/accounts/reconcile-session.ts
import { mergeCartItems, type CartLine } from '@bro-pics/shared';

export interface ReconciliationTransaction {
  getUploadsBySessionId(sessionId: string): Promise<Array<{ id: string }>>;
  getCustomizationsBySessionId(sessionId: string): Promise<Array<{ id: string }>>;
  setUploadUserId(uploadId: string, userId: string): void;
  setCustomizationUserId(customizationId: string, userId: string): void;
  getCart(userId: string): Promise<{ items: CartLine[] } | undefined>;
  setCart(userId: string, cart: { items: CartLine[] }): void;
  userExists(userId: string): Promise<boolean>;
  upsertUser(userId: string, phone: string, isNewUser: boolean): void;
}

export interface ReconciliationParams {
  sessionId: string;
  userId: string;
  phone: string;
  incomingCartItems: CartLine[];
}

/**
 * Reassigns session-owned uploads/customizations to the logged-in user,
 * merges the client's local cart into carts/{userId}, and upserts the user
 * profile — all through the transaction interface below, so the real
 * Cloud Function (reconcileSessionOnLogin) can run this inside a real
 * Firestore transaction (all-or-nothing) while this function itself stays
 * unit-testable with fakes, same pattern as generateOrderNo/
 * isDuplicateWebhookEvent.
 */
export async function runReconciliation(
  tx: ReconciliationTransaction,
  params: ReconciliationParams
): Promise<void> {
  const { sessionId, userId, phone, incomingCartItems } = params;

  // Firestore transactions require every read to happen before any write —
  // all four reads run first, and only then do the writes below fire.
  const uploads = await tx.getUploadsBySessionId(sessionId);
  const customizations = await tx.getCustomizationsBySessionId(sessionId);
  const existingCart = await tx.getCart(userId);
  const isNewUser = !(await tx.userExists(userId));

  for (const upload of uploads) tx.setUploadUserId(upload.id, userId);
  for (const customization of customizations) tx.setCustomizationUserId(customization.id, userId);

  const mergedItems = mergeCartItems(existingCart?.items ?? [], incomingCartItems);
  tx.setCart(userId, { items: mergedItems });

  tx.upsertUser(userId, phone, isNewUser);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test -- reconcile-session`
Expected: PASS

- [ ] **Step 5: Write the thin `onCall` wrapper**

```ts
// functions/src/accounts/reconcile-session.ts — append below runReconciliation
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

function buildAdminTransaction(
  db: FirebaseFirestore.Firestore,
  transaction: FirebaseFirestore.Transaction
): ReconciliationTransaction {
  return {
    async getUploadsBySessionId(sessionId) {
      const snapshot = await transaction.get(db.collection('uploads').where('sessionId', '==', sessionId));
      return snapshot.docs.map((doc) => ({ id: doc.id }));
    },
    async getCustomizationsBySessionId(sessionId) {
      const snapshot = await transaction.get(db.collection('customizations').where('sessionId', '==', sessionId));
      return snapshot.docs.map((doc) => ({ id: doc.id }));
    },
    setUploadUserId(uploadId, userId) {
      transaction.update(db.collection('uploads').doc(uploadId), { userId });
    },
    setCustomizationUserId(customizationId, userId) {
      transaction.update(db.collection('customizations').doc(customizationId), { userId });
    },
    async getCart(userId) {
      const doc = await transaction.get(db.collection('carts').doc(userId));
      return doc.exists ? (doc.data() as { items: CartLine[] }) : undefined;
    },
    setCart(userId, cart) {
      transaction.set(db.collection('carts').doc(userId), cart);
    },
    async userExists(userId) {
      const doc = await transaction.get(db.collection('users').doc(userId));
      return doc.exists;
    },
    upsertUser(userId, phone, isNewUser) {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { phone, updatedAt: now };
      if (isNewUser) payload.createdAt = now;
      transaction.set(db.collection('users').doc(userId), payload, { merge: true });
    },
  };
}

export const reconcileSessionOnLogin = onCall(async (request) => {
  const userId = request.auth?.uid;
  const phone = request.auth?.token.phone_number;
  if (!userId || !phone) {
    throw new HttpsError('unauthenticated', 'Must be signed in with a verified phone number.');
  }

  const { sessionId, cartItems } = request.data as { sessionId?: string; cartItems?: CartLine[] };
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'Missing sessionId.');
  }

  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const tx = buildAdminTransaction(db, transaction);
    await runReconciliation(tx, { sessionId, userId, phone, incomingCartItems: cartItems ?? [] });
  });
});
```

`userExists` reads `users/{userId}` inside the same transaction as every other read (`getUploadsBySessionId`, `getCustomizationsBySessionId`, `getCart`) — Firestore transactions require all reads before any writes, and `runReconciliation`'s Step 3 implementation already groups all four reads before any of the five writes (`setUploadUserId`/`setCustomizationUserId`/`setCart`/`upsertUser`) to satisfy this.

- [ ] **Step 6: Export from `functions/src/index.ts`**

```ts
// functions/src/index.ts — add
export { reconcileSessionOnLogin } from './accounts/reconcile-session';
```

- [ ] **Step 7: Run the full functions test suite**

Run: `pnpm --filter @bro-pics/functions test`
Expected: PASS

- [ ] **Step 8: Typecheck and deploy to the live project**

Run: `pnpm --filter @bro-pics/functions typecheck`
Run: `firebase deploy --only functions:reconcileSessionOnLogin`
Expected: both succeed. If deploy fails, re-read the error against the three Cloud Functions bugs already fixed earlier in this project (ESM/CommonJS module resolution, missing `initializeApp()`, stale HTTPS/background-trigger type from a prior failed deploy) before assuming a new bug.

- [ ] **Step 9: Commit**

```bash
git add functions/src/accounts/reconcile-session.ts functions/src/accounts/reconcile-session.test.ts functions/src/index.ts
git commit -m "feat(functions): add reconcileSessionOnLogin callable"
```

---

### Task 6: `CartItem.previewUrl` — editor, BuyBox, CartDrawer wiring + qty guard

**Files:**
- Modify: `apps/web/lib/cart-context.tsx`
- Modify: `apps/web/components/editor/PersonalizationEditor.tsx`
- Modify: `apps/web/components/product/BuyBox.tsx`
- Modify: `apps/web/components/layout/CartDrawer.tsx`
- Test: `apps/web/lib/cart-context.test.tsx` (existing — extend)
- Test: `apps/web/components/layout/CartDrawer.test.tsx` (existing — extend)

**Interfaces:**
- Consumes: nothing from other tasks (independent of auth/Firestore work; can run in parallel with Tasks 3-5).
- Produces: `CartItem` gains `previewUrl?: string`, matching `CartLine` from Task 2 — Task 7's Firestore-backed `CartProvider` persists this field as-is.

- [ ] **Step 1: Write the failing test for `CartItem.previewUrl`**

```tsx
// apps/web/lib/cart-context.test.tsx — ADD this test to the existing describe block
it('stores previewUrl on an added item and preserves it through updateQuantity', () => {
  const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
  act(() => {
    result.current.addItem({
      variantId: 'v1', personalizationId: 'p1', title: 'Frame', unitPriceSnapshot: 1000, qty: 1, previewUrl: 'preview.png',
    });
  });
  expect(result.current.items[0].previewUrl).toBe('preview.png');
  act(() => result.current.updateQuantity('v1', 'p1', 2));
  expect(result.current.items[0].previewUrl).toBe('preview.png');
});
```

(If the existing test file doesn't already import `renderHook`/`act` from `@testing-library/react`, add those imports — check the file's current imports first and match its existing style.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- cart-context`
Expected: FAIL — `previewUrl` is `undefined` because `CartItem` doesn't carry it through yet (it will actually pass structurally since TS won't stop an extra property at runtime — verify by checking the assertion fails only if `addItem`'s merge-on-existing branch drops unknown keys; if it doesn't fail, proceed to Step 3 anyway since the type-level gain is the point, and rely on Step 4's tsc check)

- [ ] **Step 3: Add `previewUrl` to `CartItem` and thread it through `addItem`'s merge branch**

```tsx
// apps/web/lib/cart-context.tsx — modify the interface
export interface CartItem {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
  previewUrl?: string;
}
```

The existing `addItem` spreads `{ ...i, qty: i.qty + item.qty }` on a match, which already preserves `previewUrl` from `item` — no other change needed inside `cart-context.tsx` for this step.

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @bro-pics/web test -- cart-context`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 5: Widen `PersonalizationEditor`'s `onComplete` to pass `previewUrl`**

Read `apps/web/components/editor/PersonalizationEditor.tsx` lines 355-410 first to see the exact local variable holding the computed preview URL (per the codebase context, it's a `let previewUrl: string | undefined` set around line 364, used inside the `handleDone` function that currently ends with `onComplete(personalizationId)` at line 410).

```tsx
// apps/web/components/editor/PersonalizationEditor.tsx
// Change the prop type:
  onComplete: (personalizationId: string, previewUrl?: string) => void;
// Change the final call site (was: onComplete(personalizationId);):
  onComplete(personalizationId, previewUrl);
```

- [ ] **Step 6: Update `BuyBox.handleEditorComplete` to accept and forward `previewUrl`**

```tsx
// apps/web/components/product/BuyBox.tsx
  const handleEditorComplete = (personalizationId: string, previewUrl?: string) => {
    if (!selectedVariant) return;
    addItem({
      variantId: selectedVariant.id,
      personalizationId,
      title: `${product.title} — ${selectedVariant.sizeLabel}`,
      unitPriceSnapshot: selectedVariant.price,
      qty: quantity,
      previewUrl,
    });
    setIsEditorOpen(false);
  };
```

- [ ] **Step 7: Add the failing test for `CartDrawer`'s thumbnail and qty guard**

```tsx
// apps/web/components/layout/CartDrawer.test.tsx — ADD this helper and these two tests,
// matching the existing file's SeedCart-via-real-CartProvider pattern (see the file's
// current top: SeedCart calls cart.addItem inside a useEffect on mount).

function SeedCartWithPreview() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({
      variantId: 'var_1',
      personalizationId: 'pers_1',
      title: 'Classic Wooden Frame — 8x12 in',
      unitPriceSnapshot: 79900,
      qty: 3,
      previewUrl: 'https://example.com/preview.png',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

it('renders a thumbnail image when the item has a previewUrl', () => {
  render(
    <CartProvider>
      <SeedCartWithPreview />
      <CartDrawer isOpen={true} onClose={() => {}} />
    </CartProvider>
  );
  expect(screen.getByRole('img', { name: 'Classic Wooden Frame — 8x12 in' })).toBeInTheDocument();
});

it('does not let the quantity drop below 1 when the input is cleared', () => {
  render(
    <CartProvider>
      <SeedCartWithPreview />
      <CartDrawer isOpen={true} onClose={() => {}} />
    </CartProvider>
  );
  const qtyInput = screen.getByLabelText('Quantity for Classic Wooden Frame — 8x12 in');
  fireEvent.change(qtyInput, { target: { value: '' } });
  expect((qtyInput as HTMLInputElement).value).toBe('1');
});
```

Add `useEffect` to the existing `import { useEffect } from 'react';` line if not already imported (it already is, per the file's current `SeedCart` helper).

- [ ] **Step 8: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- CartDrawer`
Expected: FAIL

- [ ] **Step 9: Implement the thumbnail and the qty guard**

```tsx
// apps/web/components/layout/CartDrawer.tsx
              <li key={`${item.variantId}-${item.personalizationId}`} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {item.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt={item.title} className="w-10 h-10 object-cover rounded" />
                  )}
                  <span>{item.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      const qty = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
                      updateQuantity(item.variantId, item.personalizationId, qty);
                    }}
                    className="w-14 rounded border border-charcoal/20 px-2 py-1"
                    aria-label={`Quantity for ${item.title}`}
                  />
                  <button onClick={() => removeItem(item.variantId, item.personalizationId)} aria-label={`Remove ${item.title}`}>
                    🗑
                  </button>
                </div>
              </li>
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- CartDrawer`
Expected: PASS

- [ ] **Step 11: Run the full web suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS — check specifically that `PersonalizationEditor.test.tsx` and `BuyBox.test.tsx` (if they assert on `onComplete`'s call signature) still pass; update any test there that calls `onComplete(personalizationId)` with just one argument if the file's own tests need adjusting for the new optional second parameter (optional params don't break existing single-arg calls, so this should be a no-op, but verify by running the suite).

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/cart-context.tsx apps/web/lib/cart-context.test.tsx apps/web/components/editor/PersonalizationEditor.tsx apps/web/components/product/BuyBox.tsx apps/web/components/layout/CartDrawer.tsx apps/web/components/layout/CartDrawer.test.tsx
git commit -m "fix(web): show cart thumbnail from personalization preview, guard qty against 0/NaN"
```

---

### Task 7: Firestore-backed `CartProvider` + login reconciliation wiring

**Files:**
- Create: `apps/web/lib/firebase-functions-client.ts`
- Modify: `apps/web/lib/cart-context.tsx`
- Modify: `apps/web/components/auth/PhoneSignIn.tsx` (only if the reconciliation call site belongs there — see Step 5; otherwise this file is unmodified and the call site lives in a new small wrapper component instead, per Step 5's judgment call)
- Test: `apps/web/lib/cart-context.test.tsx` (existing — extend)

**Interfaces:**
- Consumes: `useAuth()` (Task 4), `mergeCartItems`/`CartLine` (Task 2), `reconcileSessionOnLogin` callable (Task 5), `getOrCreateSessionId()` (existing, `apps/web/lib/session-id.ts`), `carts/{userId}` rules (Task 3).
- Produces: `CartProvider`'s existing public interface (`items`, `addItem`, `removeItem`, `updateQuantity`, `totalCount`, `totalPaise`) is unchanged — callers (`BuyBox`, `CartDrawer`) need no changes. Internally, `CartProvider` now reads/writes `carts/{userId}` via the client Firestore SDK when `useAuth().user` is set, and keeps today's local `useState` behavior when signed out.

- [ ] **Step 1: Write the failing test for signed-out behavior (unchanged) and signed-in Firestore sync**

```tsx
// apps/web/lib/cart-context.test.tsx — ADD
import { AuthProvider } from './auth-context';

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref, callback) => {
    callback({ exists: () => false, data: () => undefined });
    return () => {};
  }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

it('stays local-only (no Firestore write) when signed out', () => {
  const { result } = renderHook(() => useCart(), {
    wrapper: ({ children }) => (
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    ),
  });
  act(() => {
    result.current.addItem({ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 });
  });
  expect(result.current.items).toHaveLength(1);
  // no assertion on setDoc here — signed-out mode must not call it; a full
  // signed-in-mode test needs useAuth() mocked to return a user, which the
  // Step 3 implementation makes possible via the same firebase/auth mock
  // pattern already used in auth-context.test.tsx
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- cart-context`
Expected: FAIL if `CartProvider` doesn't yet render inside `AuthProvider` cleanly, or PASS trivially if it does (local-only path is unaffected) — either way, proceed to Step 3, which is the real behavior change this task adds.

- [ ] **Step 3: Create the Firebase Functions client helper**

```ts
// apps/web/lib/firebase-functions-client.ts
import { getFunctions, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './firebase-client';

export function getFirebaseFunctions(): Functions {
  return getFunctions(getFirebaseApp());
}
```

- [ ] **Step 4: Implement the Firestore-backed mode in `CartProvider`**

```tsx
// apps/web/lib/cart-context.tsx — full replacement of the file's implementation
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { CartLine } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';
import { getFirebaseFunctions } from './firebase-functions-client';
import { getOrCreateSessionId } from './session-id';
import { useAuth } from './auth-context';

export interface CartItem extends CartLine {}

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string, personalizationId: string) => void;
  updateQuantity: (variantId: string, personalizationId: string, qty: number) => void;
  totalCount: number;
  totalPaise: number;
}

const CartContext = createContext<CartContextValue | null>(null);

function mergeOne(prev: CartItem[], item: CartItem): CartItem[] {
  const existing = prev.find((i) => i.variantId === item.variantId && i.personalizationId === item.personalizationId);
  if (existing) {
    return prev.map((i) =>
      i.variantId === item.variantId && i.personalizationId === item.personalizationId
        ? { ...i, qty: i.qty + item.qty }
        : i
    );
  }
  return [...prev, item];
}

/**
 * Local-only React state when signed out (unchanged from the Storefront
 * phase's mock provider). Once a user signs in, this reconciles the local
 * cart into Firestore via reconcileSessionOnLogin (a one-time merge, not
 * a routine write), then switches to a live carts/{userId} subscription —
 * every add/remove/update after that point writes straight to Firestore
 * through the owner-only rule from Task 3, no server route needed.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [firestoreItems, setFirestoreItems] = useState<CartItem[] | null>(null);
  const hasReconciledRef = useRef(false);

  useEffect(() => {
    if (!user) {
      hasReconciledRef.current = false;
      setFirestoreItems(null);
      return;
    }

    const db = getFirestore(getFirebaseApp());
    const cartRef = doc(db, 'carts', user.uid);

    if (!hasReconciledRef.current) {
      hasReconciledRef.current = true;
      const sessionId = getOrCreateSessionId();
      const reconcile = httpsCallable(getFirebaseFunctions(), 'reconcileSessionOnLogin');
      reconcile({ sessionId, cartItems: localItems })
        .then(() => setLocalItems([]))
        .catch((error) => {
          // Reconciliation failed — local cart is left untouched per the
          // spec's all-or-nothing requirement, so nothing is lost; the
          // live Firestore subscription below still starts, showing
          // whatever was already in carts/{userId} from a prior session.
          console.error('reconcileSessionOnLogin failed:', error);
        });
    }

    const unsubscribe = onSnapshot(cartRef, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as { items: CartItem[] }) : undefined;
      setFirestoreItems(data?.items ?? []);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const items = user ? firestoreItems ?? [] : localItems;

  const writeFirestoreItems = (next: CartItem[]) => {
    if (!user) return;
    const db = getFirestore(getFirebaseApp());
    setDoc(doc(db, 'carts', user.uid), { items: next }).catch((error) => {
      console.error('Failed to write cart to Firestore:', error);
    });
  };

  const value = useMemo<CartContextValue>(() => {
    const addItem = (item: CartItem) => {
      if (user) {
        writeFirestoreItems(mergeOne(items, item));
      } else {
        setLocalItems((prev) => mergeOne(prev, item));
      }
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      const next = items.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId));
      if (user) {
        writeFirestoreItems(next);
      } else {
        setLocalItems(next);
      }
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      const next = items.map((i) =>
        i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
      );
      if (user) {
        writeFirestoreItems(next);
      } else {
        setLocalItems(next);
      }
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    return { items, addItem, removeItem, updateQuantity, totalCount, totalPaise };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, user]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

Note: this uses `mergeOne` (single-item merge, matching the old local-only behavior) for `addItem`, not `mergeCartItems` — the multi-line merge-by-qty-sum function from Task 2 is used only inside `reconcileSessionOnLogin` server-side (Task 5); `CartProvider` only needs the `CartLine` type from that same module, since login-time merging happens entirely inside the callable.

- [ ] **Step 5: Wire the sign-in flow to render `PhoneSignIn`**

Read `apps/web/components/layout/Header.tsx` or wherever a "sign in" entry point should live (check `apps/web/components/layout/LayoutChrome.tsx` first for the existing header/nav structure) and add a `PhoneSignIn` trigger consistent with the existing header UI pattern — e.g. an "Account" icon/button that opens a modal containing `<PhoneSignIn onSignedIn={() => {}} />` (the `onSignedIn` callback can be a no-op here: `AuthProvider`'s `onAuthStateChanged` listener already picks up the new signed-in state on its own, which is what triggers `CartProvider`'s `useEffect` above — `PhoneSignIn` doesn't need to call anything cart-related directly). Since the exact header component structure wasn't read as part of this plan, read it now before writing this step's code, and match its existing styling/structure conventions.

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/firebase-functions-client.ts apps/web/lib/cart-context.tsx apps/web/lib/cart-context.test.tsx
git commit -m "feat(web): persist cart to Firestore when signed in, wire login-time reconciliation"
```

(If Step 5 touched additional header/nav files, add and commit those in this same commit.)

---

### Task 8: Live verification against `bropics-app`

**Files:** none created or modified — this is a verification-only task.

**Interfaces:** none.

> **Prerequisite:** the manual Firebase Console checkpoint from Task 4 (Phone provider enabled, at least one test phone number registered) must be done before this task starts. If it hasn't been, stop and ask the user to complete it now.

- [ ] **Step 1: Start the dev server against the live `bropics-app` project**

Run: `pnpm --filter @bro-pics/web dev`
Confirm `apps/web/.env.local` is present (it already is) and the app boots without Firebase init errors.

- [ ] **Step 2: Build a local cart as an anonymous (signed-out) visitor**

In the browser: personalize a real seeded product (any of the 8 seeded products from earlier in this project work), add it to cart. Confirm the cart drawer shows the item and its thumbnail (Task 6's fix). Note the browser's `localStorage` `bropics_session_id` value and confirm, via the Firebase Console's Firestore data viewer, that a real `uploads`/`customizations` doc exists with that `sessionId` and no `userId` field yet.

- [ ] **Step 3: Sign in with the registered test phone number**

Trigger `PhoneSignIn` (Task 7 Step 5's entry point), enter the test number and its fixed test OTP from the Console. Confirm sign-in succeeds and `useAuth().user` becomes non-null (visually, whatever UI state Task 7 Step 5 added should reflect signed-in).

- [ ] **Step 4: Verify the reconciliation actually ran**

In the Firebase Console's Firestore data viewer, confirm:
- The `uploads`/`customizations` docs noted in Step 2 now have `userId` set to the signed-in user's uid, with `sessionId` still present and unchanged.
- A `carts/{uid}` doc exists containing the item added in Step 2.
- A `users/{uid}` doc exists with `phone` matching the test number and both `createdAt`/`updatedAt` set.

- [ ] **Step 5: Verify the cart survived a page reload**

Reload the page while still signed in. Confirm the cart drawer still shows the same item (proving the `onSnapshot` subscription in Task 7 correctly hydrates from `carts/{uid}` on mount, not just immediately after the reconciliation call).

- [ ] **Step 6: Verify a forced-failure case doesn't half-commit**

Temporarily break the reconciliation call (e.g. in browser devtools, block the `reconcileSessionOnLogin` network request or throw before it resolves) and sign in again with a fresh anonymous session that has at least one local cart item. Confirm: no partial `carts/{uid}` write occurred, no `uploads`/`customizations` doc was partially reassigned, and the app's local cart state was not silently cleared. Then remove the temporary breakage and confirm a normal sign-in still works.

- [ ] **Step 7: Report results**

Summarize pass/fail for Steps 2-6 back to the user. If any step failed, do not mark this plan complete — file the failure as a bug against the specific task/file responsible and fix it before considering Plan A done.
