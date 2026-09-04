# Phase 4 Plan B — Checkout + Razorpay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a signed-in user's Firestore cart into a paid order via Razorpay, with every price/stock check re-derived server-side and the webhook as the sole source of payment truth.

**Architecture:** A new Admin-SDK Next.js route (`/api/checkout/create-order`) re-derives prices from `products/{id}/variants`, checks stock, computes shipping, creates a Razorpay Order via their REST API, and writes `orders/{id}` + `orders/{id}/items/{itemId}`. The client opens Razorpay's Checkout.js modal (no card data ever touches our servers) and watches the order doc via `onSnapshot` for a status flip. A new Cloud Function (`onRequest`, not `onCall` — Razorpay POSTs directly) verifies the webhook signature and is the only thing that ever marks an order `paid` or clears the cart.

**Tech Stack:** Next.js App Router API routes, Firebase Admin SDK (Firestore transactions + batches, Auth `verifyIdToken`), Firebase Cloud Functions v2 (`onRequest`), Razorpay Orders API + webhooks (REST, no SDK dependency needed), zod, Vitest.

## Global Constraints

- Login is required before checkout — no guest-checkout path.
- The cart's `unitPriceSnapshot` is a display value only, never trusted for money — every price is re-derived server-side from `products/{id}/variants` at order-creation time.
- No coupons this plan — `discount` stays `0`, `couponId` stays unset on every order.
- No GST this plan — `taxLines` stays `[]`.
- `paymentMode` is always `'prepaid'`, `amountDueOnDelivery` always `0` — no partial-COD logic.
- No order-tracking UI or `orders/{orderId}/events/{eventId}` writes this plan — Plan C's job.
- No inventory decrementing/reservation — stock is a boolean-ish gate (`stockStatus === 'in_stock'`) checked once at order creation, not locked.
- Razorpay integration uses **test-mode** credentials only this plan (the client hasn't completed KYC for live-mode credentials yet).

---

### Task 1: `OrderItemSchema`

**Files:**
- Create: `packages/shared/src/schemas/order-item.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/order-item.test.ts`

**Interfaces:**
- Produces: `OrderItemSchema`, `type OrderItem` (`{id, productId, variantId, personalizationId, title, unitPrice, qty, previewUrl}`), exported from `@bro-pics/shared`. Consumed by Task 6 (creating order-item docs) and Task 7 (nothing reads it, but it must exist before Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/schemas/order-item.test.ts
import { describe, it, expect } from 'vitest';
import { OrderItemSchema } from './order-item';

function baseOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item_1',
    productId: 'prod_1',
    variantId: 'var_1',
    personalizationId: 'pers_1',
    title: 'Classic Wooden Frame — 8x12 in',
    unitPrice: 79900,
    qty: 2,
    previewUrl: 'https://example.com/preview.png',
    ...overrides,
  };
}

describe('OrderItemSchema', () => {
  it('accepts a full valid order item', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem()).success).toBe(true);
  });

  it('accepts a null previewUrl', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ previewUrl: null })).success).toBe(true);
  });

  it('rejects a negative unitPrice', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ unitPrice: -100 })).success).toBe(false);
  });

  it('rejects a non-positive qty', () => {
    expect(OrderItemSchema.safeParse(baseOrderItem({ qty: 0 })).success).toBe(false);
  });

  it('rejects a missing personalizationId', () => {
    const { personalizationId: _drop, ...rest } = baseOrderItem();
    expect(OrderItemSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `Cannot find module './order-item'`

- [ ] **Step 3: Write the schema**

```ts
// packages/shared/src/schemas/order-item.ts
import { z } from 'zod';

export const OrderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  personalizationId: z.string(),
  title: z.string().min(1),
  unitPrice: z.number().int().nonnegative(),
  qty: z.number().int().positive(),
  previewUrl: z.string().nullable(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
```

```ts
// packages/shared/src/index.ts — add
export * from './schemas/order-item';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/order-item.ts packages/shared/src/schemas/order-item.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add OrderItemSchema"
```

---

### Task 2: `OrderSchema` money-invariant self-validation

**Files:**
- Modify: `packages/shared/src/schemas/order.ts`
- Test: `packages/shared/src/schemas/order.test.ts` (new — no test file existed for this schema before)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `OrderSchema.safeParse(...)` now fails on a money-invariant violation, in addition to its existing field-level checks. No field/type changes — `Order`'s shape is unchanged. Task 6 must construct orders that satisfy both invariants before calling `OrderSchema.parse(...)`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/schemas/order.test.ts
import { describe, it, expect } from 'vitest';
import { OrderSchema } from './order';

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    orderNo: 'BP-2026-00001',
    userId: 'user_1',
    status: 'pending_payment',
    paymentStatus: 'pending',
    subtotal: 100000,
    discount: 0,
    shipping: 5000,
    total: 105000,
    addressJson: { line1: '12 MG Road', city: 'Chennai' },
    placedAt: new Date('2026-09-04T00:00:00.000Z'),
    paymentMode: 'prepaid',
    amountPaidOnline: 105000,
    amountDueOnDelivery: 0,
    taxLines: [],
    ...overrides,
  };
}

describe('OrderSchema money invariants', () => {
  it('accepts an order whose totals are internally consistent', () => {
    expect(OrderSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it('rejects when subtotal - discount + shipping does not equal total', () => {
    const result = OrderSchema.safeParse(baseOrder({ total: 999999 }));
    expect(result.success).toBe(false);
  });

  it('rejects when amountPaidOnline + amountDueOnDelivery does not equal total', () => {
    const result = OrderSchema.safeParse(baseOrder({ amountPaidOnline: 1, amountDueOnDelivery: 1 }));
    expect(result.success).toBe(false);
  });

  it('accepts a discounted order whose totals still add up', () => {
    const result = OrderSchema.safeParse(
      baseOrder({ subtotal: 100000, discount: 10000, shipping: 5000, total: 95000, amountPaidOnline: 95000 })
    );
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL on the two rejection tests (they'll currently PASS-through as valid, since no invariant check exists yet) — confirm by reading the actual output, don't assume.

- [ ] **Step 3: Add the `superRefine`**

```ts
// packages/shared/src/schemas/order.ts — wrap the existing z.object(...) definition
export const OrderSchema = z
  .object({
    id: z.string(),
    orderNo: z.string(),
    userId: z.string(),
    status: OrderStatusSchema,
    paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']),
    subtotal: z.number().int().nonnegative(),
    discount: z.number().int().nonnegative(),
    shipping: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    couponId: z.string().optional(),
    addressJson: z.record(z.string(), z.unknown()),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    notes: z.string().optional(),
    placedAt: z.date(),
    paymentMode: z.enum(['prepaid', 'partial_cod']),
    amountPaidOnline: z.number().int().nonnegative(),
    amountDueOnDelivery: z.number().int().nonnegative(),
    taxLines: z.array(
      z.object({
        gstin: z.string().optional(),
        rate: z.number().nonnegative(),
        amount: z.number().int().nonnegative(),
      })
    ),
  })
  .superRefine((order, ctx) => {
    if (order.subtotal - order.discount + order.shipping !== order.total) {
      ctx.addIssue({ code: 'custom', message: 'subtotal - discount + shipping must equal total' });
    }
    if (order.amountPaidOnline + order.amountDueOnDelivery !== order.total) {
      ctx.addIssue({ code: 'custom', message: 'amountPaidOnline + amountDueOnDelivery must equal total' });
    }
  });
```

(The `OrderStatusSchema` export above the object definition is unchanged — only the `z.object({...})` gains the `.superRefine(...)` wrapper.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/order.ts packages/shared/src/schemas/order.test.ts
git commit -m "feat(shared): self-validate OrderSchema's money invariants"
```

---

### Task 3: Move `generateOrderNo` into `packages/shared`

**Why this task exists:** `generateOrderNo` currently lives only in `functions/src/orders/orderNumber.ts`. Task 6's `/api/checkout/create-order` route (in `apps/web`, a separate package from `functions/`) needs to call it too, and `apps/web` cannot import from `functions/src` (separate deployable, not a shared package). Moving the pure logic into `packages/shared` — which both `apps/web` and `functions/` already depend on — is the same pattern this project used for `printDimensionsForRotation` (Phase 3) once two packages needed the same calculation. `functions/src/orders/orderNumber.ts` becomes a thin re-export so its existing callers and its own test file need no changes.

**Files:**
- Create: `packages/shared/src/orders/order-number.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `functions/src/orders/orderNumber.ts`
- Test: `packages/shared/src/orders/order-number.test.ts` (new — the exact same test cases as the existing `functions/src/orders/orderNumber.test.ts`, since this is a pure relocation)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `generateOrderNo(tx: CounterTransaction, year: number): Promise<string>`, `type CounterTransaction`, `type CounterDocRef`, all exported from `@bro-pics/shared`. Consumed by Task 6.

- [ ] **Step 1: Read the existing implementation and test to copy exactly**

Read `functions/src/orders/orderNumber.ts` and `functions/src/orders/orderNumber.test.ts` in full — copy both verbatim into the new location (only the import path in the test changes).

- [ ] **Step 2: Create the shared copy**

```ts
// packages/shared/src/orders/order-number.ts
export interface CounterDocRef {
  readonly path: string;
}

export interface CounterTransaction {
  get(ref: CounterDocRef): Promise<{ exists: boolean; data(): { value: number } | undefined }>;
  set(ref: CounterDocRef, data: { value: number }): void;
}

const COUNTER_REF: CounterDocRef = { path: 'counters/orderSeq' };

export async function generateOrderNo(tx: CounterTransaction, year: number): Promise<string> {
  const snapshot = await tx.get(COUNTER_REF);
  const currentValue = snapshot.exists ? snapshot.data()!.value : 0;
  const nextValue = currentValue + 1;
  tx.set(COUNTER_REF, { value: nextValue });
  const padded = String(nextValue).padStart(5, '0');
  return `BP-${year}-${padded}`;
}
```

```ts
// packages/shared/src/orders/order-number.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateOrderNo } from './order-number';
import type { CounterTransaction } from './order-number';

function makeFakeTransaction(currentValue: number | undefined): CounterTransaction {
  const docSnapshot = {
    exists: currentValue !== undefined,
    data: () => (currentValue !== undefined ? { value: currentValue } : undefined),
  };
  return {
    get: vi.fn().mockResolvedValue(docSnapshot),
    set: vi.fn(),
  };
}

describe('generateOrderNo', () => {
  it('starts at 1 when the counter does not exist yet', async () => {
    const tx = makeFakeTransaction(undefined);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00001');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 1 });
  });

  it('increments the existing counter', async () => {
    const tx = makeFakeTransaction(183);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00184');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 184 });
  });

  it('pads to 5 digits', async () => {
    const tx = makeFakeTransaction(9);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00010');
  });
});
```

```ts
// packages/shared/src/index.ts — add
export * from './orders/order-number';
```

- [ ] **Step 3: Turn `functions/src/orders/orderNumber.ts` into a re-export**

```ts
// functions/src/orders/orderNumber.ts — full replacement
export { generateOrderNo } from '@bro-pics/shared';
export type { CounterTransaction, CounterDocRef } from '@bro-pics/shared';
```

Leave `functions/src/orders/orderNumber.test.ts` completely untouched — it imports `from './orderNumber'`, which still resolves (now via the re-export) to the exact same function, so it should pass unmodified.

- [ ] **Step 4: Run both packages' tests**

Run: `pnpm --filter @bro-pics/shared test`
Run: `pnpm --filter @bro-pics/functions test`
Expected: PASS on both — `functions`'s existing `orderNumber.test.ts` (3 tests) must still pass unchanged, proving the re-export is transparent.

- [ ] **Step 5: Confirm the functions bundle still resolves `@bro-pics/shared` correctly**

Run: `pnpm --filter @bro-pics/functions bundle`
Expected: succeeds, produces `functions/lib/index.js`. (`@bro-pics/shared` resolution via esbuild + tsconfig paths was already established in Phase 4 Plan A — this task doesn't change that mechanism, just adds one more re-exported name to what gets bundled.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/orders/order-number.ts packages/shared/src/orders/order-number.test.ts packages/shared/src/index.ts functions/src/orders/orderNumber.ts
git commit -m "refactor(shared): move generateOrderNo into packages/shared so apps/web can reuse it"
```

---

### Task 4: `userId`-at-write-time on `/api/uploads` and `/api/customizations`

**Files:**
- Create: `apps/web/lib/verify-id-token.ts`
- Modify: `apps/web/app/api/uploads/route.ts`
- Modify: `apps/web/app/api/customizations/route.ts`
- Test: `apps/web/lib/verify-id-token.test.ts`
- Test: `apps/web/app/api/uploads/route.test.ts` (existing — extend)
- Test: `apps/web/app/api/customizations/route.test.ts` (existing — extend)

**Interfaces:**
- Produces: `getUserIdFromAuthHeader(request: Request): Promise<string | null>`, exported from `apps/web/lib/verify-id-token.ts`. Consumed by Task 6 (required there — a `null` means 401) and used optionally in this task's two routes (a `null` there just means "proceed without setting `userId`", matching today's behavior exactly).

- [ ] **Step 1: Write the failing test for the helper**

```ts
// apps/web/lib/verify-id-token.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getUserIdFromAuthHeader } from './verify-id-token';

const mockVerifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
vi.mock('./firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

describe('getUserIdFromAuthHeader', () => {
  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://example.com', { headers: {} });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns null when the header does not start with "Bearer "', async () => {
    const request = new Request('https://example.com', { headers: { Authorization: 'Basic xyz' } });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns the uid when the token verifies', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user_1' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getUserIdFromAuthHeader(request)).toBe('user_1');
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer bad-token' } });
    expect(await getUserIdFromAuthHeader(request)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token`
Expected: FAIL — `Cannot find module './verify-id-token'`

- [ ] **Step 3: Implement the helper**

```ts
// apps/web/lib/verify-id-token.ts
import 'server-only';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './firebase-admin';

/**
 * Optional identity extraction — a null return means "proceed as signed
 * out," never an error response on its own. Callers that REQUIRE a signed-in
 * user (checkout) turn a null into their own 401; callers where auth is
 * optional (uploads/customizations, pre-login-compatible) just omit userId.
 */
export async function getUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token`
Expected: PASS

- [ ] **Step 5: Wire it into `/api/uploads`**

Read `apps/web/app/api/uploads/route.ts` in full first (it currently builds a `rejected`/`ready` `Upload` object at two call sites). Add, right after the existing `sessionId` header check:

```ts
  const userId = await getUserIdFromAuthHeader(request);
```

Then include `userId` conditionally in BOTH the `rejected` and `ready` `Upload` object literals (they're two separate `const` declarations in the current file):

```ts
  const rejected: Upload = {
    id: uploadId,
    sessionId,
    ...(userId && { userId }),
    originalUrl: 'rejected://not-uploaded',
    // ...rest unchanged
  };
```

```ts
  const ready: Upload = {
    id: uploadId,
    sessionId,
    ...(userId && { userId }),
    originalUrl: signedUrl,
    // ...rest unchanged
  };
```

Add the import: `import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';`

- [ ] **Step 6: Wire it into `/api/customizations`**

Read `apps/web/app/api/customizations/route.ts` in full first. Add the same `const userId = await getUserIdFromAuthHeader(request);` right after the existing `sessionId` header check, and add `userId` into the object passed to `CustomizationSchema.safeParse(...)`:

```ts
  const parsed = CustomizationSchema.safeParse({
    ...body,
    id: docRef.id,
    sessionId,
    effectiveDpi,
    ...(userId && { userId }),
  });
```

Add the same import (adjust the relative path to match this route's directory depth).

- [ ] **Step 7: Extend the existing route tests**

Add to `apps/web/app/api/uploads/route.test.ts` (read the file first to match its existing request-construction/mocking style exactly):

```ts
it('sets userId on the created upload when a valid Authorization header is present', async () => {
  vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce('user_1');
  // ...construct the same successful-upload request the existing "creates a ready upload" test uses, plus an Authorization header
  // assert the response body / the doc written via the mocked Firestore has userId: 'user_1'
});

it('omits userId when no Authorization header is present (unchanged pre-login behavior)', async () => {
  vi.mocked(getUserIdFromAuthHeader).mockResolvedValueOnce(null);
  // ...same successful-upload request, no Authorization header
  // assert the response body has no userId field
});
```

Add equivalent tests to `apps/web/app/api/customizations/route.test.ts`, matching that file's existing test-setup pattern. Mock `getUserIdFromAuthHeader` at the top of both test files (`vi.mock('../../../../lib/verify-id-token')`, adjusting the relative path to match each route's depth).

- [ ] **Step 8: Run the full web suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS — including every pre-existing uploads/customizations test unmodified in behavior (a request with no `Authorization` header must produce byte-identical output to before this task).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/verify-id-token.ts apps/web/lib/verify-id-token.test.ts apps/web/app/api/uploads/route.ts apps/web/app/api/uploads/route.test.ts apps/web/app/api/customizations/route.ts apps/web/app/api/customizations/route.test.ts
git commit -m "feat(web): set userId on uploads/customizations at write time when signed in"
```

---

### Task 5: Shipping settings + price/shipping pure calculation

**Files:**
- Modify: `apps/web/lib/firestore-settings.ts`
- Create: `apps/web/lib/checkout-calc.ts`
- Test: `apps/web/lib/firestore-settings.test.ts` (existing if present, else new — check first)
- Test: `apps/web/lib/checkout-calc.test.ts`

**Interfaces:**
- Consumes: `Variant` type from `@bro-pics/shared` (existing).
- Produces: `getShippingSettings(): Promise<{freeShippingThreshold: number; flatShippingCharge: number}>` (from `firestore-settings.ts`); `priceCartLines(cartItems, variantsById): {priced: PricedCartLine[]; unavailable: UnavailableLine[]}`, `calculateSubtotal(priced: PricedCartLine[]): number`, `calculateShipping(subtotal: number, settings: {freeShippingThreshold: number; flatShippingCharge: number}): number`, and `type PricedCartLine`/`type UnavailableLine` — all from `checkout-calc.ts`. Consumed by Task 6.

- [ ] **Step 1: Write the failing test for `getShippingSettings`**

First check whether `apps/web/lib/firestore-settings.test.ts` already exists (`getAnnouncementBarSettings` may or may not have one) — read it if present and match its exact mocking style for `firebase-admin/firestore`; if absent, create it fresh using the same `getFirestore`/`getAdminApp` mocking pattern this codebase already uses elsewhere (e.g. `apps/web/lib/firestore-product-detail.test.ts`).

```ts
// apps/web/lib/firestore-settings.test.ts — add these tests (alongside any existing ones for getAnnouncementBarSettings)
describe('getShippingSettings', () => {
  it('returns the stored values when settings/shipping exists', async () => {
    // mock the settings/shipping doc to exist with { freeShippingThreshold: 200000, flatShippingCharge: 3000 }
    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 200000, flatShippingCharge: 3000 });
  });

  it('falls back to placeholder defaults when settings/shipping does not exist', async () => {
    // mock the doc to not exist
    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- firestore-settings`
Expected: FAIL — `getShippingSettings is not a function` (or similar)

- [ ] **Step 3: Implement `getShippingSettings`**

```ts
// apps/web/lib/firestore-settings.ts — add below the existing getAnnouncementBarSettings

// Placeholder values — the client hasn't supplied real shipping rules yet
// (PROJECT_STATUS.md §6). Flat ₹50, free above ₹1500, both in paise. Settings
// are stored one document per key (settings/{key}), matching how
// getAnnouncementBarSettings above already reads settings/announcementBar —
// NOT as one combined document, despite SettingsSchema's shape suggesting
// that; nothing in this codebase actually writes a single combined document.
const DEFAULT_SHIPPING_SETTINGS = { freeShippingThreshold: 150000, flatShippingCharge: 5000 };

export async function getShippingSettings(): Promise<{
  freeShippingThreshold: number;
  flatShippingCharge: number;
}> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('shipping').get();
  if (!doc.exists) return DEFAULT_SHIPPING_SETTINGS;

  const data = doc.data();
  const freeShippingThreshold =
    typeof data?.freeShippingThreshold === 'number'
      ? data.freeShippingThreshold
      : DEFAULT_SHIPPING_SETTINGS.freeShippingThreshold;
  const flatShippingCharge =
    typeof data?.flatShippingCharge === 'number'
      ? data.flatShippingCharge
      : DEFAULT_SHIPPING_SETTINGS.flatShippingCharge;

  return { freeShippingThreshold, flatShippingCharge };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- firestore-settings`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `checkout-calc.ts`**

```ts
// apps/web/lib/checkout-calc.test.ts
import { describe, it, expect } from 'vitest';
import { priceCartLines, calculateSubtotal, calculateShipping } from './checkout-calc';
import type { Variant } from '@bro-pics/shared';

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'var_1',
    productId: 'prod_1',
    sku: 'SKU1',
    sizeLabel: '8x12',
    widthIn: 8,
    heightIn: 12,
    frameColour: 'walnut',
    material: 'wood',
    price: 79900,
    stockStatus: 'in_stock',
    printWidthPx: 2400,
    printHeightPx: 3600,
    minUploadPx: 2400,
    aspectRatio: 8 / 12,
    isActive: true,
    ...overrides,
  };
}

const cartLine = {
  variantId: 'var_1',
  personalizationId: 'pers_1',
  title: 'Classic Wooden Frame — 8x12 in',
  qty: 2,
  previewUrl: 'https://example.com/preview.png',
};

describe('priceCartLines', () => {
  it('prices a line from the variant, ignoring any client-supplied price', () => {
    const variantsById = new Map([['var_1', makeVariant({ price: 79900 })]]);
    const { priced, unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([]);
    expect(priced).toEqual([
      {
        variantId: 'var_1',
        productId: 'prod_1',
        personalizationId: 'pers_1',
        title: 'Classic Wooden Frame — 8x12 in',
        unitPrice: 79900,
        qty: 2,
        previewUrl: 'https://example.com/preview.png',
      },
    ]);
  });

  it('defaults previewUrl to null when the cart line has none', () => {
    const variantsById = new Map([['var_1', makeVariant()]]);
    const { previewUrl: _drop, ...lineWithoutPreview } = cartLine;
    const { priced } = priceCartLines([lineWithoutPreview], variantsById);
    expect(priced[0].previewUrl).toBeNull();
  });

  it('flags a line as unavailable when the variant is not found', () => {
    const { priced, unavailable } = priceCartLines([cartLine], new Map());
    expect(priced).toEqual([]);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'not_found' }]);
  });

  it('flags a line as unavailable when the variant is inactive', () => {
    const variantsById = new Map([['var_1', makeVariant({ isActive: false })]]);
    const { unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'inactive' }]);
  });

  it('flags a line as unavailable when the variant is out of stock', () => {
    const variantsById = new Map([['var_1', makeVariant({ stockStatus: 'out_of_stock' })]]);
    const { unavailable } = priceCartLines([cartLine], variantsById);
    expect(unavailable).toEqual([{ variantId: 'var_1', reason: 'out_of_stock' }]);
  });

  it('collects every unavailable line, not just the first', () => {
    const variantsById = new Map([['var_2', makeVariant({ id: 'var_2', stockStatus: 'out_of_stock' })]]);
    const lines = [cartLine, { ...cartLine, variantId: 'var_2', personalizationId: 'pers_2' }];
    const { unavailable } = priceCartLines(lines, variantsById);
    expect(unavailable).toEqual([
      { variantId: 'var_1', reason: 'not_found' },
      { variantId: 'var_2', reason: 'out_of_stock' },
    ]);
  });
});

describe('calculateSubtotal', () => {
  it('sums unitPrice * qty across all priced lines', () => {
    const priced = [
      { variantId: 'v1', productId: 'p1', personalizationId: 'pers_1', title: 'A', unitPrice: 1000, qty: 2, previewUrl: null },
      { variantId: 'v2', productId: 'p2', personalizationId: 'pers_2', title: 'B', unitPrice: 500, qty: 3, previewUrl: null },
    ];
    expect(calculateSubtotal(priced)).toBe(1000 * 2 + 500 * 3);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe('calculateShipping', () => {
  const settings = { freeShippingThreshold: 150000, flatShippingCharge: 5000 };

  it('charges the flat rate below the free-shipping threshold', () => {
    expect(calculateShipping(100000, settings)).toBe(5000);
  });

  it('is free at or above the threshold', () => {
    expect(calculateShipping(150000, settings)).toBe(0);
    expect(calculateShipping(200000, settings)).toBe(0);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- checkout-calc`
Expected: FAIL — `Cannot find module './checkout-calc'`

- [ ] **Step 7: Implement `checkout-calc.ts`**

```ts
// apps/web/lib/checkout-calc.ts
import type { Variant } from '@bro-pics/shared';

export interface PricedCartLine {
  variantId: string;
  productId: string;
  personalizationId: string;
  title: string;
  unitPrice: number;
  qty: number;
  previewUrl: string | null;
}

export interface UnavailableLine {
  variantId: string;
  reason: 'not_found' | 'inactive' | 'out_of_stock';
}

export interface CartLineInput {
  variantId: string;
  personalizationId: string;
  title: string;
  qty: number;
  previewUrl?: string;
}

/**
 * Re-derives every line's price from the server-fetched variant — the
 * cart's own unitPriceSnapshot is a display value, never money (see
 * PROJECT_STATUS.md's tracked gap from Plan A's final review). Also gates
 * on stock/active status. Pure — callers fetch variants first (Firestore
 * reads), then hand this function the results, so it stays unit-testable
 * without a live database.
 */
export function priceCartLines(
  cartItems: CartLineInput[],
  variantsById: Map<string, Variant>
): { priced: PricedCartLine[]; unavailable: UnavailableLine[] } {
  const priced: PricedCartLine[] = [];
  const unavailable: UnavailableLine[] = [];

  for (const item of cartItems) {
    const variant = variantsById.get(item.variantId);
    if (!variant) {
      unavailable.push({ variantId: item.variantId, reason: 'not_found' });
      continue;
    }
    if (!variant.isActive) {
      unavailable.push({ variantId: item.variantId, reason: 'inactive' });
      continue;
    }
    if (variant.stockStatus !== 'in_stock') {
      unavailable.push({ variantId: item.variantId, reason: 'out_of_stock' });
      continue;
    }
    priced.push({
      variantId: item.variantId,
      productId: variant.productId,
      personalizationId: item.personalizationId,
      title: item.title,
      unitPrice: variant.price,
      qty: item.qty,
      previewUrl: item.previewUrl ?? null,
    });
  }

  return { priced, unavailable };
}

export function calculateSubtotal(priced: PricedCartLine[]): number {
  return priced.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function calculateShipping(
  subtotal: number,
  settings: { freeShippingThreshold: number; flatShippingCharge: number }
): number {
  return subtotal >= settings.freeShippingThreshold ? 0 : settings.flatShippingCharge;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- checkout-calc`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/firestore-settings.ts apps/web/lib/firestore-settings.test.ts apps/web/lib/checkout-calc.ts apps/web/lib/checkout-calc.test.ts
git commit -m "feat(web): add shipping settings reader and pure checkout price/shipping calc"
```

---

### Task 6: `POST /api/checkout/create-order`

**Files:**
- Create: `apps/web/lib/razorpay-client.ts`
- Create: `apps/web/app/api/checkout/create-order/route.ts`
- Test: `apps/web/lib/razorpay-client.test.ts`
- Test: `apps/web/app/api/checkout/create-order/route.test.ts`

**Interfaces:**
- Consumes: `getUserIdFromAuthHeader` (Task 4), `priceCartLines`/`calculateSubtotal`/`calculateShipping`/`getShippingSettings` (Task 5), `generateOrderNo`/`type CounterTransaction` (Task 3, from `@bro-pics/shared`), `OrderSchema`/`OrderItemSchema` (Tasks 1-2, from `@bro-pics/shared`), `findVariantById` (existing, `apps/web/lib/variant-lookup.ts`), `Address`/`AddressSchema` (existing, from `@bro-pics/shared`, Plan A).
- Produces: `POST /api/checkout/create-order` — request `{ addressId: string }` + `Authorization: Bearer <idToken>` header (required); response `200 { orderId, razorpayOrderId, amount, keyId }` on success, `401` if unauthenticated, `400` for an empty cart or an address that doesn't exist/isn't owned by the caller, `409 { unavailable: UnavailableLine[] }` if any cart line can't be priced. Consumed by Task 9 (the checkout page).

- [ ] **Step 1: Write the failing test for `createRazorpayOrder`**

```ts
// apps/web/lib/razorpay-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRazorpayOrder } from './razorpay-client';

describe('createRazorpayOrder', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('posts to the Razorpay Orders API with Basic auth and returns the created order', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'order_rzp_1' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await createRazorpayOrder({ amount: 105000, currency: 'INR', receipt: 'BP-2026-00001' });

    expect(result).toEqual({ id: 'order_rzp_1' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ amount: 105000, currency: 'INR', receipt: 'BP-2026-00001' }),
      })
    );
  });

  it('throws when Razorpay responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }) as unknown as typeof fetch;

    await expect(createRazorpayOrder({ amount: 100, currency: 'INR', receipt: 'r1' })).rejects.toThrow(/401/);
  });

  it('throws when the API keys are not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(createRazorpayOrder({ amount: 100, currency: 'INR', receipt: 'r1' })).rejects.toThrow(
      /RAZORPAY_KEY_ID/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- razorpay-client`
Expected: FAIL — `Cannot find module './razorpay-client'`

- [ ] **Step 3: Implement `razorpay-client.ts`**

```ts
// apps/web/lib/razorpay-client.ts
import 'server-only';

export interface CreateRazorpayOrderParams {
  amount: number;
  currency: string;
  receipt: string;
}

export interface RazorpayOrder {
  id: string;
}

export async function createRazorpayOrder(params: CreateRazorpayOrderParams): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${text}`);
  }

  return (await response.json()) as RazorpayOrder;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- razorpay-client`
Expected: PASS

- [ ] **Step 5: Write the failing tests for the route**

```ts
// apps/web/app/api/checkout/create-order/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args) }));

const mockCreateRazorpayOrder = vi.fn();
vi.mock('../../../../lib/razorpay-client', () => ({
  createRazorpayOrder: (...args: unknown[]) => mockCreateRazorpayOrder(...args),
}));

const mockGetShippingSettings = vi.fn();
vi.mock('../../../../lib/firestore-settings', () => ({
  getShippingSettings: () => mockGetShippingSettings(),
}));

const mockFindVariantById = vi.fn();
vi.mock('../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

// Mock the Admin SDK Firestore surface this route needs: reading carts/{uid}
// and users/{uid}/addresses/{addressId}, running one transaction (order
// number counter), and one batch commit (order + order items).
const mockCartDoc = { get: vi.fn() };
const mockAddressDoc = { get: vi.fn() };
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockRunTransaction = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id?: string) => {
      if (name === 'carts') return mockCartDoc;
      return { id: id ?? 'generated_id', get: vi.fn(), collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'item_id' })) })) };
    }),
  })),
  doc: vi.fn(() => ({})),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  batch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/checkout/create-order', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout/create-order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no valid Authorization header', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when the cart is empty', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ items: [] }) });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when the address does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ addressId: 'addr_missing' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 with the unavailable lines when a variant is out of stock', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 1 }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({ exists: true, data: () => ({ line1: '12 MG Road', city: 'Chennai' }) });
    mockFindVariantById.mockResolvedValueOnce({
      id: 'v1',
      productId: 'p1',
      price: 1000,
      stockStatus: 'out_of_stock',
      isActive: true,
    });
    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.unavailable).toEqual([{ variantId: 'v1', reason: 'out_of_stock' }]);
  });

  it('creates a Razorpay order and an orders/{id} doc on a fully available cart', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockCartDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', qty: 2, previewUrl: 'x.png' }] }),
    });
    mockAddressDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ id: 'addr_1', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', label: null, line2: null, isDefault: true }),
    });
    mockFindVariantById.mockResolvedValueOnce({ id: 'v1', productId: 'p1', price: 1000, stockStatus: 'in_stock', isActive: true });
    mockGetShippingSettings.mockResolvedValueOnce({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
    mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<string>) =>
      fn({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() })
    );
    mockCreateRazorpayOrder.mockResolvedValueOnce({ id: 'order_rzp_1' });

    const response = await POST(makeRequest({ addressId: 'addr_1' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.razorpayOrderId).toBe('order_rzp_1');
    expect(body.amount).toBe(2 * 1000 + 5000); // subtotal + flat shipping (below free threshold)
    expect(mockCreateRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2 * 1000 + 5000, currency: 'INR' })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- checkout/create-order`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 7: Implement the route**

```ts
// apps/web/app/api/checkout/create-order/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { getShippingSettings } from '../../../../lib/firestore-settings';
import { priceCartLines, calculateSubtotal, calculateShipping, type CartLineInput } from '../../../../lib/checkout-calc';
import { findVariantById } from '../../../../lib/variant-lookup';
import { createRazorpayOrder } from '../../../../lib/razorpay-client';
import { generateOrderNo, OrderSchema, OrderItemSchema, type CounterTransaction, type Address } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const addressId = typeof body?.addressId === 'string' ? body.addressId : null;
  if (!addressId) {
    return NextResponse.json({ error: 'Missing addressId' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  const addressDoc = await db.collection('users').doc(userId).collection('addresses').doc(addressId).get();
  if (!addressDoc.exists) {
    return NextResponse.json({ error: `Unknown addressId: ${addressId}` }, { status: 400 });
  }
  const address = addressDoc.data() as Address;

  // One lookup per distinct variant — cart sizes are small (single digits),
  // so this stays a handful of requests, same pattern /api/customizations
  // already uses for a single variant lookup.
  const uniqueVariantIds = [...new Set(cartItems.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]);

  const { priced, unavailable } = priceCartLines(cartItems, variantsById);
  if (unavailable.length > 0) {
    return NextResponse.json({ unavailable }, { status: 409 });
  }

  const subtotal = calculateSubtotal(priced);
  const shippingSettings = await getShippingSettings();
  const shipping = calculateShipping(subtotal, shippingSettings);
  const discount = 0;
  const total = subtotal - discount + shipping;

  // Step 1: generate the order number in its own short transaction — this
  // commits BEFORE the Razorpay HTTP call below. An external API call must
  // never sit inside a Firestore transaction (transactions can retry on
  // contention, and Razorpay's API isn't safely repeatable).
  const orderNo = await db.runTransaction(async (transaction) => {
    const adapter: CounterTransaction = {
      async get(ref) {
        const snap = await transaction.get(db.doc(ref.path));
        return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
      },
      set(ref, data) {
        transaction.set(db.doc(ref.path), data);
      },
    };
    return generateOrderNo(adapter, new Date().getFullYear());
  });

  // Step 2: create the Razorpay order, outside any Firestore transaction.
  const razorpayOrder = await createRazorpayOrder({ amount: total, currency: 'INR', receipt: orderNo });

  // Step 3: write the order + order items as a plain batch — a fresh
  // orderId, nothing else can be contending for it, no transaction needed.
  const orderRef = db.collection('orders').doc();
  const order = OrderSchema.parse({
    id: orderRef.id,
    orderNo,
    userId,
    status: 'pending_payment',
    paymentStatus: 'pending',
    subtotal,
    discount,
    shipping,
    total,
    addressJson: address,
    razorpayOrderId: razorpayOrder.id,
    placedAt: new Date(),
    paymentMode: 'prepaid',
    amountPaidOnline: total,
    amountDueOnDelivery: 0,
    taxLines: [],
  });

  const batch = db.batch();
  batch.set(orderRef, order);
  for (const line of priced) {
    const itemRef = orderRef.collection('items').doc();
    batch.set(itemRef, OrderItemSchema.parse({ ...line, id: itemRef.id }));
  }
  await batch.commit();

  return NextResponse.json(
    { orderId: orderRef.id, razorpayOrderId: razorpayOrder.id, amount: total, keyId: process.env.RAZORPAY_KEY_ID },
    { status: 200 }
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- checkout/create-order`
Expected: PASS. If the mock wiring in Step 5's test needs small adjustments to match the exact `db.collection(...).doc(...)` call shape the implementation above actually makes, adjust the test's mocks accordingly — the assertions (status codes, response bodies, `createRazorpayOrder`'s call args) are what must hold, not the exact mock plumbing.

- [ ] **Step 9: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/razorpay-client.ts apps/web/lib/razorpay-client.test.ts apps/web/app/api/checkout/create-order/route.ts apps/web/app/api/checkout/create-order/route.test.ts
git commit -m "feat(web): add POST /api/checkout/create-order"
```

---

### Task 7: Razorpay webhook Cloud Function

**Files:**
- Create: `functions/src/webhooks/razorpay.ts`
- Test: `functions/src/webhooks/razorpay.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `isDuplicateWebhookEvent`, `markWebhookProcessed`, `type WebhookTransaction` (existing, `functions/src/webhooks/idempotency.ts`, unchanged).
- Produces: `handlePaymentCaptured(webhookTx, paymentTx, params): Promise<void>`, `handlePaymentFailed(paymentTx, params): Promise<void>`, `type PaymentEventTransaction` — the pure, unit-tested core. `razorpayWebhook` — the thin `onRequest` Cloud Function, exported from `functions/src/index.ts`.

- [ ] **Step 1: Write the failing tests for the pure logic**

```ts
// functions/src/webhooks/razorpay.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handlePaymentCaptured, handlePaymentFailed } from './razorpay';
import type { PaymentEventTransaction } from './razorpay';
import type { WebhookTransaction } from './idempotency';

function makeWebhookTx(alreadyProcessed: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists: alreadyProcessed }),
    set: vi.fn(),
  };
}

function makePaymentTx(order: { id: string; userId: string } | null): PaymentEventTransaction {
  return {
    findOrderByRazorpayOrderId: vi.fn().mockResolvedValue(order),
    markPaymentCaptured: vi.fn(),
    markPaymentFailed: vi.fn(),
    clearCart: vi.fn(),
  };
}

describe('handlePaymentCaptured', () => {
  it('marks the order paid, clears the cart, and records the event as processed', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).toHaveBeenCalledWith('order_1', 'pay_abc');
    expect(paymentTx.clearCart).toHaveBeenCalledWith('user_1');
    expect(webhookTx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: 'order_1' }));
  });

  it('does nothing when the event was already processed (idempotent retry)', async () => {
    const webhookTx = makeWebhookTx(true);
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
  });

  it('does nothing when no matching order is found', async () => {
    const webhookTx = makeWebhookTx(false);
    const paymentTx = makePaymentTx(null);

    await handlePaymentCaptured(webhookTx, paymentTx, {
      eventId: 'pay_abc',
      razorpayOrderId: 'order_rzp_unknown',
      razorpayPaymentId: 'pay_abc',
    });

    expect(paymentTx.markPaymentCaptured).not.toHaveBeenCalled();
  });
});

describe('handlePaymentFailed', () => {
  it('marks the matching order as failed', async () => {
    const paymentTx = makePaymentTx({ id: 'order_1', userId: 'user_1' });
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_1' });
    expect(paymentTx.markPaymentFailed).toHaveBeenCalledWith('order_1');
    expect(paymentTx.clearCart).not.toHaveBeenCalled();
  });

  it('does nothing when no matching order is found', async () => {
    const paymentTx = makePaymentTx(null);
    await handlePaymentFailed(paymentTx, { razorpayOrderId: 'order_rzp_unknown' });
    expect(paymentTx.markPaymentFailed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/functions test -- razorpay`
Expected: FAIL — `Cannot find module './razorpay'`

- [ ] **Step 3: Write the pure logic**

```ts
// functions/src/webhooks/razorpay.ts (part 1 — pure logic, testable with fakes)
import { isDuplicateWebhookEvent, markWebhookProcessed, type WebhookTransaction } from './idempotency';

export interface PaymentEventTransaction {
  findOrderByRazorpayOrderId(razorpayOrderId: string): Promise<{ id: string; userId: string } | null>;
  markPaymentCaptured(orderId: string, razorpayPaymentId: string): void;
  markPaymentFailed(orderId: string): void;
  clearCart(userId: string): void;
}

/**
 * Firestore transactions require every read to finish before any write —
 * this function calls isDuplicateWebhookEvent (read) and
 * findOrderByRazorpayOrderId (read) BEFORE any of the three writes below,
 * mirroring the same rule reconcileSessionOnLogin (Phase 4 Plan A) had to
 * get right for the same reason.
 */
export async function handlePaymentCaptured(
  webhookTx: WebhookTransaction,
  paymentTx: PaymentEventTransaction,
  params: { eventId: string; razorpayOrderId: string; razorpayPaymentId: string }
): Promise<void> {
  const alreadyProcessed = await isDuplicateWebhookEvent(webhookTx, params.eventId);
  if (alreadyProcessed) return;

  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;

  paymentTx.markPaymentCaptured(order.id, params.razorpayPaymentId);
  paymentTx.clearCart(order.userId);
  markWebhookProcessed(webhookTx, params.eventId, order.id);
}

export async function handlePaymentFailed(
  paymentTx: PaymentEventTransaction,
  params: { razorpayOrderId: string }
): Promise<void> {
  const order = await paymentTx.findOrderByRazorpayOrderId(params.razorpayOrderId);
  if (!order) return;
  paymentTx.markPaymentFailed(order.id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/functions test -- razorpay`
Expected: PASS

- [ ] **Step 5: Write the thin `onRequest` wrapper**

```ts
// functions/src/webhooks/razorpay.ts (part 2 — append below the pure logic)
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function buildWebhookTx(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction): WebhookTransaction {
  return {
    async get(ref) {
      const snap = await transaction.get(db.doc(ref.path));
      return { exists: snap.exists };
    },
    set(ref, data) {
      transaction.set(db.doc(ref.path), data);
    },
  };
}

function buildPaymentTx(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction): PaymentEventTransaction {
  return {
    async findOrderByRazorpayOrderId(razorpayOrderId) {
      const snapshot = await transaction.get(
        db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1)
      );
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      return { id: doc.id, userId: (doc.data() as { userId: string }).userId };
    },
    markPaymentCaptured(orderId, razorpayPaymentId) {
      transaction.update(db.collection('orders').doc(orderId), {
        status: 'paid',
        paymentStatus: 'paid',
        razorpayPaymentId,
      });
    },
    markPaymentFailed(orderId) {
      transaction.update(db.collection('orders').doc(orderId), { paymentStatus: 'failed' });
    },
    clearCart(userId) {
      transaction.set(db.collection('carts').doc(userId), { items: [] });
    },
  };
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
}

export const razorpayWebhook = onRequest(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (typeof signature !== 'string' || !secret) {
    res.status(400).send('Missing signature or secret');
    return;
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const bodyString = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body);
  if (!verifySignature(bodyString, signature, secret)) {
    res.status(400).send('Invalid signature');
    return;
  }

  const body = req.body as RazorpayWebhookBody;
  const paymentEntity = body.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    res.status(200).send('Ignored: no payment entity');
    return;
  }

  const db = getFirestore();

  if (body.event === 'payment.captured') {
    await db.runTransaction(async (transaction) => {
      const webhookTx = buildWebhookTx(db, transaction);
      const paymentTx = buildPaymentTx(db, transaction);
      await handlePaymentCaptured(webhookTx, paymentTx, {
        eventId: paymentEntity.id!,
        razorpayOrderId: paymentEntity.order_id!,
        razorpayPaymentId: paymentEntity.id!,
      });
    });
    res.status(200).send('OK');
    return;
  }

  if (body.event === 'payment.failed') {
    await db.runTransaction(async (transaction) => {
      const paymentTx = buildPaymentTx(db, transaction);
      await handlePaymentFailed(paymentTx, { razorpayOrderId: paymentEntity.order_id! });
    });
    res.status(200).send('OK');
    return;
  }

  res.status(200).send('Ignored: unhandled event type');
});
```

- [ ] **Step 6: Export from `functions/src/index.ts`**

```ts
// functions/src/index.ts — add
export { razorpayWebhook } from './webhooks/razorpay';
```

- [ ] **Step 7: Run the full functions test suite, typecheck, and bundle**

Run: `pnpm --filter @bro-pics/functions test`
Run: `pnpm --filter @bro-pics/functions typecheck`
Run: `pnpm --filter @bro-pics/functions bundle`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add functions/src/webhooks/razorpay.ts functions/src/webhooks/razorpay.test.ts functions/src/index.ts
git commit -m "feat(functions): add Razorpay webhook handler"
```

---

### Task 8: Address collection UI

**Files:**
- Create: `apps/web/components/checkout/AddressForm.tsx`
- Create: `apps/web/components/checkout/AddressPicker.tsx`
- Test: `apps/web/components/checkout/AddressForm.test.tsx`
- Test: `apps/web/components/checkout/AddressPicker.test.tsx`

**Interfaces:**
- Consumes: `AddressSchema`/`type Address` (existing, `@bro-pics/shared`, Plan A); `getFirebaseApp()` (existing, `apps/web/lib/firebase-client.ts`).
- Produces: `AddressForm` (props: `{userId: string; onSaved: (address: Address) => void; onCancel?: () => void}`), `AddressPicker` (props: `{userId: string; onSelect: (addressId: string) => void}`) — both consumed by Task 9's checkout page.

- [ ] **Step 1: Write the failing test for `AddressForm`**

```tsx
// apps/web/components/checkout/AddressForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddressForm } from './AddressForm';

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  collection: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('AddressForm', () => {
  beforeEach(() => mockSetDoc.mockClear());

  it('saves a filled-in address and calls onSaved', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '600001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' })
    );
  });

  it('does not submit when a required field is empty', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);
    fireEvent.click(screen.getByText('Save address'));
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- AddressForm`
Expected: FAIL — `Cannot find module './AddressForm'`

- [ ] **Step 3: Implement `AddressForm.tsx`**

```tsx
// apps/web/components/checkout/AddressForm.tsx
'use client';

import { useState } from 'react';
import { getFirestore, doc, collection, setDoc } from 'firebase/firestore';
import { AddressSchema, type Address } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';

interface AddressFormProps {
  userId: string;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}

export function AddressForm({ userId, onSaved, onCancel }: AddressFormProps) {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const db = getFirestore(getFirebaseApp());
    const addressesCollection = collection(db, 'users', userId, 'addresses');
    const addressId = doc(addressesCollection).id;

    const candidate = {
      id: addressId,
      label: label || null,
      line1,
      line2: line2 || null,
      city,
      state,
      pincode,
      phone,
      isDefault: false,
    };

    const parsed = AddressSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Please fill in address line 1, city, state, pincode, and phone.');
      return;
    }

    await setDoc(doc(db, 'users', userId, 'addresses', addressId), parsed.data);
    onSaved(parsed.data);
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="address-label">Label (optional)</label>
      <input id="address-label" value={label} onChange={(e) => setLabel(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-line1">Address line 1</label>
      <input id="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-line2">Address line 2 (optional)</label>
      <input id="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-city">City</label>
      <input id="address-city" value={city} onChange={(e) => setCity(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-state">State</label>
      <input id="address-state" value={state} onChange={(e) => setState(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-pincode">Pincode</label>
      <input id="address-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-phone">Phone</label>
      <input id="address-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} className="rounded bg-charcoal text-cream px-4 py-2">
          Save address
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded border border-charcoal/20 px-4 py-2">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- AddressForm`
Expected: PASS

- [ ] **Step 5: Write the failing test for `AddressPicker`**

```tsx
// apps/web/components/checkout/AddressPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddressPicker } from './AddressPicker';

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(addresses: Array<Record<string, unknown>>) {
  return { docs: addresses.map((data) => ({ data: () => data })) };
}

describe('AddressPicker', () => {
  it('shows saved addresses with the default one pre-selected', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Home', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: false },
        { id: 'addr_2', label: 'Work', line1: '5 Anna Salai', city: 'Chennai', state: 'TN', pincode: '600002', phone: '+91124', line2: null, isDefault: true },
      ])
    );
    const onSelect = vi.fn();
    render(<AddressPicker userId="user_1" onSelect={onSelect} />);

    expect(await screen.findByText(/Work/)).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith('addr_2');
  });

  it('shows the "add new address" form when no saved addresses exist', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([]));
    render(<AddressPicker userId="user_1" onSelect={vi.fn()} />);
    expect(await screen.findByText('Save address')).toBeInTheDocument();
  });

  it('calls onSelect when a different saved address is chosen', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Home', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: true },
        { id: 'addr_2', label: 'Work', line1: '5 Anna Salai', city: 'Chennai', state: 'TN', pincode: '600002', phone: '+91124', line2: null, isDefault: false },
      ])
    );
    const onSelect = vi.fn();
    render(<AddressPicker userId="user_1" onSelect={onSelect} />);
    fireEvent.click(await screen.findByLabelText(/Work/));
    expect(onSelect).toHaveBeenLastCalledWith('addr_2');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- AddressPicker`
Expected: FAIL — `Cannot find module './AddressPicker'`

- [ ] **Step 7: Implement `AddressPicker.tsx`**

```tsx
// apps/web/components/checkout/AddressPicker.tsx
'use client';

import { useEffect, useState } from 'react';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import type { Address } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';
import { AddressForm } from './AddressForm';

interface AddressPickerProps {
  userId: string;
  onSelect: (addressId: string) => void;
}

export function AddressPicker({ userId, onSelect }: AddressPickerProps) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const db = getFirestore(getFirebaseApp());
    getDocs(collection(db, 'users', userId, 'addresses')).then((snapshot) => {
      const loaded = snapshot.docs.map((d) => d.data() as Address);
      setAddresses(loaded);
      const preferred = loaded.find((a) => a.isDefault) ?? loaded[0];
      if (preferred) {
        setSelectedId(preferred.id);
        onSelect(preferred.id);
      } else {
        setShowForm(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect(id);
  };

  const handleNewAddressSaved = (address: Address) => {
    setAddresses((prev) => [...(prev ?? []), address]);
    setShowForm(false);
    handleSelect(address.id);
  };

  if (addresses === null) return <p>Loading addresses…</p>;

  return (
    <div className="flex flex-col gap-3">
      {addresses.map((address) => (
        <label key={address.id} className="flex items-center gap-2">
          <input
            type="radio"
            name="address"
            checked={selectedId === address.id}
            onChange={() => handleSelect(address.id)}
          />
          {address.label ? `${address.label} — ` : ''}
          {address.line1}, {address.city}, {address.state} {address.pincode}
        </label>
      ))}

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="text-sm underline w-fit">
          Add a new address
        </button>
      )}
      {showForm && <AddressForm userId={userId} onSaved={handleNewAddressSaved} onCancel={() => setShowForm(false)} />}
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- AddressPicker`
Expected: PASS

- [ ] **Step 9: Run the full web suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/checkout/AddressForm.tsx apps/web/components/checkout/AddressForm.test.tsx apps/web/components/checkout/AddressPicker.tsx apps/web/components/checkout/AddressPicker.test.tsx
git commit -m "feat(web): add address collection form and picker for checkout"
```

---

### Task 9: Checkout page + Razorpay Checkout.js + "Proceed to Checkout"

**Files:**
- Create: `apps/web/app/checkout/page.tsx`
- Create: `apps/web/lib/razorpay-checkout-script.ts`
- Modify: `apps/web/components/layout/CartDrawer.tsx`
- Test: `apps/web/app/checkout/page.test.tsx`
- Test: `apps/web/components/layout/CartDrawer.test.tsx` (existing — extend)

**Interfaces:**
- Consumes: `useAuth()` (existing, Plan A), `useCart()` (existing), `AddressPicker` (Task 8), the `/api/checkout/create-order` response shape (Task 6: `{orderId, razorpayOrderId, amount, keyId}`).
- Produces: `/checkout` page. `loadRazorpayCheckoutScript(): Promise<void>` from `razorpay-checkout-script.ts` (loads Razorpay's `checkout.js` once, idempotently, via a `<script>` tag — Razorpay does not ship an npm package for this, the vendor's own integration is a global `Razorpay` constructor loaded from their CDN script).

- [ ] **Step 1: Write the failing test for the script loader**

```ts
// apps/web/lib/razorpay-checkout-script.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRazorpayCheckoutScript } from './razorpay-checkout-script';

describe('loadRazorpayCheckoutScript', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('appends a script tag pointing at Razorpay checkout.js', async () => {
    const promise = loadRazorpayCheckoutScript();
    const script = document.querySelector('script[src*="checkout.razorpay.com"]');
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not append a second script tag if one already exists', async () => {
    const first = loadRazorpayCheckoutScript();
    document.querySelector('script[src*="checkout.razorpay.com"]')?.dispatchEvent(new Event('load'));
    await first;

    await loadRazorpayCheckoutScript();
    const scripts = document.querySelectorAll('script[src*="checkout.razorpay.com"]');
    expect(scripts.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- razorpay-checkout-script`
Expected: FAIL — `Cannot find module './razorpay-checkout-script'`

- [ ] **Step 3: Implement the script loader**

```ts
// apps/web/lib/razorpay-checkout-script.ts
'use client';

let loadPromise: Promise<void> | null = null;

export function loadRazorpayCheckoutScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
  if (existing) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- razorpay-checkout-script`
Expected: PASS

- [ ] **Step 5: Add "Proceed to Checkout" to `CartDrawer`**

Read `apps/web/components/layout/CartDrawer.tsx` in full first (it currently ends with a subtotal row after the items list). Add a checkout link/button right after the subtotal:

```tsx
        <div className="mt-auto pt-4 border-t border-charcoal/10 flex items-center justify-between">
          <span className="font-medium">Subtotal</span>
          <span data-testid="cart-subtotal" className="font-medium">
            ₹{formatPaise(totalPaise)}
          </span>
        </div>
        {items.length > 0 && (
          <a href="/checkout" className="rounded bg-charcoal text-cream px-4 py-2 text-center">
            Proceed to Checkout
          </a>
        )}
```

Add one test to `CartDrawer.test.tsx` (matching its existing `SeedCart`-via-real-`CartProvider` pattern from prior tasks): confirm the "Proceed to Checkout" link appears (with `href="/checkout"`) when the cart has items, and does not appear when it's empty.

- [ ] **Step 6: Write the failing test for the checkout page**

```tsx
// apps/web/app/checkout/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from './page';

vi.mock('../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));
vi.mock('../../lib/cart-context', () => ({
  useCart: vi.fn(() => ({
    items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 }],
    totalPaise: 1000,
  })),
}));
vi.mock('../../components/checkout/AddressPicker', () => ({
  AddressPicker: ({ onSelect }: { onSelect: (id: string) => void }) => {
    onSelect('addr_1');
    return <div data-testid="address-picker" />;
  },
}));
vi.mock('../../lib/razorpay-checkout-script', () => ({ loadRazorpayCheckoutScript: vi.fn().mockResolvedValue(undefined) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('CheckoutPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (global as unknown as { Razorpay?: unknown }).Razorpay = vi.fn().mockImplementation(() => ({ open: vi.fn() }));
  });

  it('shows a sign-in prompt when signed out', async () => {
    const { useAuth } = await import('../../lib/auth-context');
    vi.mocked(useAuth).mockReturnValueOnce({ user: null, loading: false });
    render(<CheckoutPage />);
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('calls create-order and opens Razorpay Checkout on "Place Order"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'order_rzp_1', amount: 1000, keyId: 'rzp_test_key' }),
    });
    render(<CheckoutPage />);

    fireEvent.click(await screen.findByText('Place Order'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/checkout/create-order',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
        })
      )
    );
    await waitFor(() => expect((global as unknown as { Razorpay: ReturnType<typeof vi.fn> }).Razorpay).toHaveBeenCalled());
  });

  it('shows the unavailable-line error when create-order returns 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ unavailable: [{ variantId: 'v1', reason: 'out_of_stock' }] }),
    });
    render(<CheckoutPage />);
    fireEvent.click(await screen.findByText('Place Order'));
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- checkout/page`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 8: Implement the checkout page**

```tsx
// apps/web/app/checkout/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { AddressPicker } from '../../components/checkout/AddressPicker';
import { loadRazorpayCheckoutScript } from '../../lib/razorpay-checkout-script';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function CheckoutPage() {
  const { user } = useAuth();
  const { items, totalPaise } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  if (!user) {
    return <p>Please sign in to check out.</p>;
  }

  const handlePlaceOrder = async () => {
    if (!addressId) {
      setError('Please choose or add a delivery address.');
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ addressId }),
      });

      if (response.status === 409) {
        setError('Some items in your cart are no longer available. Please review your cart and try again.');
        return;
      }
      if (!response.ok) {
        setError('Could not place your order. Please try again.');
        return;
      }

      const { orderId: newOrderId, razorpayOrderId, amount, keyId } = await response.json();
      setOrderId(newOrderId);

      await loadRazorpayCheckoutScript();
      const razorpay = new window.Razorpay({
        key: keyId,
        amount,
        currency: 'INR',
        order_id: razorpayOrderId,
        name: 'BroPics',
        handler: () => {
          // Intentionally does nothing beyond letting the user know payment
          // is being confirmed — the order-status listener below (driven by
          // the webhook, the actual source of truth) is what flips the UI
          // to a real confirmation, not this client-side callback.
        },
      });
      razorpay.open();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-2xl">Checkout</h1>

      <AddressPicker userId={user.uid} onSelect={setAddressId} />

      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={`${item.variantId}-${item.personalizationId}`} className="flex justify-between text-sm">
            <span>{item.title} × {item.qty}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium pt-2 border-t border-charcoal/10">
          <span>Subtotal</span>
          <span>₹{(totalPaise / 100).toFixed(2)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {orderId && <p className="text-sm text-charcoal/70">Order {orderId} created — complete payment in the window that opened.</p>}

      <button onClick={handlePlaceOrder} disabled={placing} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Place Order
      </button>
    </main>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- checkout/page`
Expected: PASS. If `window.Razorpay` isn't recognized by TypeScript in the test file, confirm the `declare global` block in the page component covers it — the test file itself only needs to set `(global as unknown as {Razorpay?: unknown}).Razorpay`, not redeclare the type.

- [ ] **Step 10: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/checkout/page.tsx apps/web/app/checkout/page.test.tsx apps/web/lib/razorpay-checkout-script.ts apps/web/lib/razorpay-checkout-script.test.ts apps/web/components/layout/CartDrawer.tsx apps/web/components/layout/CartDrawer.test.tsx
git commit -m "feat(web): add checkout page with Razorpay Checkout.js and a Proceed to Checkout entry point"
```

---

### Task 10: Live verification against Razorpay test mode

**Files:** none created or modified — this is a verification-only task.

**Interfaces:** none.

> **Prerequisite, manual checkpoint (like Task 4/8's Firebase Console steps in Plan A):** a Razorpay account with test-mode API keys and a webhook secret. Free to create, no KYC required for test mode. Steps: sign up at razorpay.com → Dashboard → stay in **Test Mode** (toggle, top of dashboard) → Settings → API Keys → generate a test key pair (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) → Settings → Webhooks → add a webhook pointing at the deployed `razorpayWebhook` function's URL, subscribed to `payment.captured` and `payment.failed`, and note the webhook secret it generates. Add `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` to `functions/`'s environment (`firebase functions:secrets:set` or `.env` per this project's existing functions env pattern — check how `FIREBASE_SERVICE_ACCOUNT_JSON` or similar secrets are currently supplied to `functions/` and match it) and `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (server-side only — `RAZORPAY_KEY_SECRET` must never reach the client) to `apps/web/.env.local`. If this hasn't been done yet, stop and ask the user to complete it now.

- [ ] **Step 1: Deploy the webhook function**

Run: `firebase deploy --only functions:razorpayWebhook`
Confirm it deploys successfully (per Plan A's lesson, the `predeploy` hooks now correctly run `pnpm --dir functions bundle` first — no manual pre-bundle step should be needed, but if deploy fails with a stale-bundle-shaped error, run `pnpm --filter @bro-pics/functions bundle` manually first and retry).

- [ ] **Step 2: Start the dev server and add a real cart item**

Run: `pnpm --filter @bro-pics/web dev`
Sign in with a real (or Console-registered test) phone number, personalize one of the seeded products, add it to cart.

- [ ] **Step 3: Go through checkout with a real Razorpay test-mode payment**

Navigate to `/checkout`, fill in or select an address, click "Place Order." Confirm the Razorpay Checkout.js modal opens. Use one of [Razorpay's documented test card numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/) (test mode only — this is publicly documented, not a secret) to complete a successful payment.

- [ ] **Step 4: Verify the webhook actually fired and the order updated**

In the Firebase Console's Firestore data viewer: confirm the `orders/{id}` doc now has `status: 'paid'`, `paymentStatus: 'paid'`, and a real `razorpayPaymentId`. Confirm `carts/{uid}` is now `{items: []}`. Confirm a `webhookEvents/{eventId}` doc exists for this payment.

- [ ] **Step 5: Verify a failed payment doesn't corrupt state**

Repeat Steps 2-3 with a test card documented to simulate a failure. Confirm the order's `paymentStatus` becomes `'failed'` while `status` stays `'pending_payment'`, and that `carts/{uid}` still contains the original items (untouched, so the customer can retry).

- [ ] **Step 6: Verify webhook idempotency**

If Razorpay's dashboard offers a "resend webhook" action for the successful payment's event, use it and confirm the order isn't double-processed (no duplicate cart-clear side effects, `webhookEvents` doc unchanged). If no resend option is available, this can be skipped — the unit tests from Task 7 already prove the idempotency logic in isolation.

- [ ] **Step 7: Report results**

Summarize pass/fail for Steps 1-6 back to the user. If any step failed, do not consider this plan complete — file the failure against the specific task/file responsible and fix it before moving to Plan C.
