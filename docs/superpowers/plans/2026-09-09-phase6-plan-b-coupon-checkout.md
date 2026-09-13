# Phase 6, Plan B — Coupon Application at Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing, fully-tested-but-never-called coupon math (`calculateCouponDiscount`, `CouponSchema`) into a real checkout flow — a preview/validate route, real discount application in `create-order` (replacing the hardcoded `discount: 0`), a checkout-page coupon input, and seed data so the homepage's `NEW10` banner actually works.

**Architecture:** One new lib function (`findCouponByCode`, alongside `order-lookup.ts`'s existing helpers), one new route (`POST /api/checkout/coupon/validate`), targeted changes to the existing `create-order` route (no schema change — `OrderSchema.couponId` has existed unused since Foundation), an additive UI section on the existing checkout page, and one new seed array + its staging call.

**Tech Stack:** Next.js App Router (`apps/web`), Firebase Admin SDK, Firestore, Vitest + Testing Library.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it.
- Follow this codebase's existing patterns exactly: relative imports, the fake-Firestore-query test style in `apps/web/lib/order-lookup.test.ts`, the route-test mocking style in `apps/web/app/api/checkout/create-order/route.test.ts`.
- Both new/changed routes use `getUserIdFromAuthHeader` (any signed-in user) — this is customer-facing checkout work, not staff/admin.
- `firestore.rules`' `coupons/{code}` collection blocks ALL client writes (`allow write: if false`) and restricts reads to staff/admin — every coupon read AND the `usedCount` write must go through the Admin SDK (bypasses rules), never a client SDK call.
- A coupon code IS its own Firestore doc id (`coupons/{code}`) — always `.doc(code).get()`, never a `.where('code', '==', ...)` query.
- Firestore returns `startsAt`/`endsAt` as Timestamps, not `Date` — convert before `CouponSchema.parse(...)`, matching the Timestamp-vs-Date pattern this project has hit repeatedly (see `PROJECT_STATUS.md` §5).
- A coupon that fails re-validation at `create-order` time does NOT block the order — it proceeds with `discount: 0`, no `couponId` written. Never turn a stale/racing coupon into a hard checkout failure.
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `findCouponByCode` lib function

**Files:**
- Create: `apps/web/lib/coupon-lookup.ts`
- Create: `apps/web/lib/coupon-lookup.test.ts`

**Interfaces:**
- Produces: `findCouponByCode(db: Firestore, code: string): Promise<Coupon | null>` — consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/coupon-lookup.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { findCouponByCode } from './coupon-lookup';

function makeFakeDb(exists: boolean, data?: Record<string, unknown>) {
  const get = vi.fn().mockResolvedValue({ exists, data: () => data });
  return {
    db: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })) },
    get,
  };
}

describe('findCouponByCode', () => {
  it('returns the parsed coupon, converting Timestamp fields to Date, when the doc exists', async () => {
    const { db } = makeFakeDb(true, {
      code: 'NEW10',
      type: 'percent',
      value: 10,
      startsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
      endsAt: Timestamp.fromDate(new Date('2027-01-01T00:00:00.000Z')),
      appliesTo: 'all',
      usedCount: 0,
    });
    const result = await findCouponByCode(db as never, 'NEW10');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NEW10');
    expect(result?.startsAt).toBeInstanceOf(Date);
    expect(result?.endsAt).toBeInstanceOf(Date);
  });

  it('returns null when the doc does not exist', async () => {
    const { db } = makeFakeDb(false);
    const result = await findCouponByCode(db as never, 'UNKNOWN');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- coupon-lookup.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/coupon-lookup.ts`:

```ts
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { CouponSchema, type Coupon } from '@bro-pics/shared';

/**
 * Coupon codes are their own Firestore doc id (coupons/{code}), matching
 * firestore.rules' match /coupons/{code} shape — a direct doc lookup, not
 * a queried field. firestore.rules blocks all client reads/writes on this
 * collection except staff/admin reads, so every caller of this function
 * must be an Admin SDK route.
 */
export async function findCouponByCode(db: Firestore, code: string): Promise<Coupon | null> {
  const doc = await db.collection('coupons').doc(code).get();
  if (!doc.exists) return null;
  const data = doc.data() as Record<string, unknown>;
  return CouponSchema.parse({
    ...data,
    startsAt: (data.startsAt as Timestamp).toDate(),
    endsAt: (data.endsAt as Timestamp).toDate(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- coupon-lookup.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/coupon-lookup.ts apps/web/lib/coupon-lookup.test.ts
git commit -m "feat(checkout): add findCouponByCode lib function"
```

---

### Task 2: `POST /api/checkout/coupon/validate` route

**Files:**
- Create: `apps/web/app/api/checkout/coupon/validate/route.ts`
- Create: `apps/web/app/api/checkout/coupon/validate/route.test.ts`

**Interfaces:**
- Consumes: `findCouponByCode` (Task 1), `getUserIdFromAuthHeader` (existing), `calculateCouponDiscount` (existing, `@bro-pics/shared`), the cart-pricing helpers already used by `create-order` (`priceCartLines`, `calculateSubtotal`, `findVariantById`).
- Produces: `POST /api/checkout/coupon/validate` → `200 { valid: true, discountPaise, freeShipping }` or `200 { valid: false, reason }`, or `401`/`400`/`404` — consumed by Task 5's checkout page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/checkout/coupon/validate/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockFindCouponByCode = vi.fn();
vi.mock('../../../../../lib/coupon-lookup', () => ({
  findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args),
}));

const mockFindVariantById = vi.fn();
vi.mock('../../../../../lib/variant-lookup', () => ({
  findVariantById: (...args: unknown[]) => mockFindVariantById(...args),
}));

const mockCartDocGet = vi.fn();
const mockOrdersWhere = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'carts') return { doc: vi.fn(() => ({ get: mockCartDocGet })) };
      if (name === 'orders') return { where: mockOrdersWhere };
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/checkout/coupon/validate', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const NOW_COUPON = {
  code: 'NEW10',
  type: 'percent' as const,
  value: 10,
  startsAt: new Date('2020-01-01T00:00:00.000Z'),
  endsAt: new Date('2030-01-01T00:00:00.000Z'),
  appliesTo: 'all' as const,
  usedCount: 0,
};

describe('POST /api/checkout/coupon/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCartDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame', qty: 1 }] }),
    });
    mockFindVariantById.mockResolvedValue({ id: 'v1', productId: 'prod_1', price: 100000, isActive: true, stockStatus: 'in_stock' });
    mockOrdersWhere.mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 0 }) });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when code is missing', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 404 when the coupon does not exist', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ code: 'UNKNOWN' }));
    expect(response.status).toBe(404);
  });

  it('returns valid:true with the correct discount for a percent coupon', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce(NOW_COUPON);
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: true, discountPaise: 10000, freeShipping: false });
  });

  it('returns valid:false with the reason from calculateCouponDiscount when rejected', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, minOrder: 999999999 });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: false, reason: 'below_min_order' });
  });

  it('returns valid:false with per_user_limit_reached when the caller already used it up', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, perUserLimit: 1 });
    mockOrdersWhere.mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 1 }) });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ valid: false, reason: 'per_user_limit_reached' });
  });

  it('sets freeShipping true for a free_ship coupon', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindCouponByCode.mockResolvedValueOnce({ ...NOW_COUPON, type: 'free_ship', value: 0 });
    const response = await POST(makeRequest({ code: 'NEW10' }));
    const body = await response.json();
    expect(body).toEqual({ valid: true, discountPaise: 0, freeShipping: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "checkout/coupon/validate/route.test.ts"`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/checkout/coupon/validate/route.ts`. Reuse the same cart-fetch/reprice pattern `create-order/route.ts` already has (read `carts/{userId}`, price via `findVariantById` + `priceCartLines` + `calculateSubtotal`) — do not import from `create-order/route.ts` itself (routes don't export helpers to each other in this codebase); duplicate the handful of lines the same way `create-order` already inlines them, since extracting a shared helper is a larger refactor outside this task's scope:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { findCouponByCode } from '../../../../../lib/coupon-lookup';
import { findVariantById } from '../../../../../lib/variant-lookup';
import { priceCartLines, calculateSubtotal, type CartLineInput } from '../../../../../lib/checkout-calc';
import { calculateCouponDiscount } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const code = typeof body?.code === 'string' && body.code.trim().length > 0 ? body.code.trim() : null;
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  const coupon = await findCouponByCode(db, code);
  if (!coupon) {
    return NextResponse.json({ error: 'Unknown coupon code' }, { status: 404 });
  }

  const cartDoc = await db.collection('carts').doc(userId).get();
  const cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  const uniqueVariantIds = [...new Set(cartItems.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]);
  const { priced } = priceCartLines(cartItems, variantsById);
  const subtotal = calculateSubtotal(priced);

  if (coupon.perUserLimit) {
    const usedSnapshot = await db.collection('orders').where('userId', '==', userId).where('couponId', '==', code).get();
    if (usedSnapshot.size >= coupon.perUserLimit) {
      return NextResponse.json({ valid: false, reason: 'per_user_limit_reached' }, { status: 200 });
    }
  }

  const result = calculateCouponDiscount(subtotal, coupon);
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 200 });
  }

  return NextResponse.json(
    { valid: true, discountPaise: result.discountPaise, freeShipping: coupon.type === 'free_ship' },
    { status: 200 }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "checkout/coupon/validate/route.test.ts"`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/checkout/coupon/validate/route.ts apps/web/app/api/checkout/coupon/validate/route.test.ts
git commit -m "feat(checkout): add coupon preview/validate route"
```

---

### Task 3: Apply the coupon in `create-order`

**Files:**
- Modify: `apps/web/app/api/checkout/create-order/route.ts`
- Modify: `apps/web/app/api/checkout/create-order/route.test.ts`

**Interfaces:**
- Consumes: `findCouponByCode` (Task 1), `calculateCouponDiscount` (existing).

This task changes the meaning of the request body's `discount`/`couponId` handling, so read the CURRENT full file first (`apps/web/app/api/checkout/create-order/route.ts`) before editing — the brief below shows only the delta, not the full file, to avoid drift from the real current content.

- [ ] **Step 1: Write the failing test**

Read the current `apps/web/app/api/checkout/create-order/route.test.ts` in full first — its existing `mockDb` (top of file) has `collection: vi.fn((name) => ({ doc: vi.fn(...) }))` with branches for `carts`/`users`/`orders`, and `batch: () => ({ set: mockBatchSet, commit: mockBatchCommit })` with no `update` method and no `where` support anywhere. This task's new logic needs both, so extend the existing mocks rather than duplicating them:

1. Add `const mockBatchUpdate = vi.fn();` near the existing `mockBatchSet`/`mockBatchCommit` declarations, and add `update: mockBatchUpdate` to the `batch: () => ({...})` return value.
2. Add a `coupons` branch to the `collection` mock's `doc` factory (alongside the existing `carts`/`users`/`orders` branches) — it just needs to return a stable reference object (e.g. `{ id }`) since it's only ever passed as the first arg to `batch.update`, never read from directly in this route.
3. Add an `orders` branch that also supports `.where(...).where(...).get()` for the `perUserLimit` check (the existing `orders` branch only supports `.collection()` for order-items, not `.where()`) — add a `where: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ size: 0 }) })) }))` alongside the existing `id`/`collection` fields on that branch, and override its resolved `size` per-test where the per-user-limit tests need a nonzero count (they don't in this task's own test cases below, but keep the hook available if a later fix round needs it).
4. Add the `findCouponByCode` mock:

```ts
const mockFindCouponByCode = vi.fn();
vi.mock('../../../../lib/coupon-lookup', () => ({
  findCouponByCode: (...args: unknown[]) => mockFindCouponByCode(...args),
}));
```

Then add these test cases:

```ts
it('applies a valid coupon: reduces total and writes couponId onto the order', async () => {
  // ...existing valid-cart/address setup from the file's other passing tests...
  mockFindCouponByCode.mockResolvedValueOnce({
    code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
    startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
  });
  const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'NEW10' }));
  expect(response.status).toBe(200);
  expect(mockBatchSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ couponId: 'NEW10', discount: expect.any(Number) })
  );
  // the specific discount amount asserted against the fixture's known subtotal
});

it('zeroes shipping (not discount) for a valid free_ship coupon', async () => {
  mockFindCouponByCode.mockResolvedValueOnce({
    code: 'FREESHIP', type: 'free_ship', value: 0, appliesTo: 'all', usedCount: 0,
    startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
  });
  const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'FREESHIP' }));
  expect(response.status).toBe(200);
  expect(mockBatchSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ shipping: 0, discount: 0, couponId: 'FREESHIP' })
  );
});

it('proceeds without a discount when the coupon fails re-validation, rather than blocking the order', async () => {
  mockFindCouponByCode.mockResolvedValueOnce(null); // unknown/expired by order time
  const response = await POST(makeRequest({ addressId: 'addr_1', couponCode: 'STALE' }));
  expect(response.status).toBe(200);
  expect(mockBatchSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ discount: 0 })
  );
});

it('increments the coupon usedCount in the same batch as a successful coupon order', async () => {
  mockFindCouponByCode.mockResolvedValueOnce({
    code: 'NEW10', type: 'percent', value: 10, appliesTo: 'all', usedCount: 0,
    startsAt: new Date('2020-01-01'), endsAt: new Date('2030-01-01'),
  });
  await POST(makeRequest({ addressId: 'addr_1', couponCode: 'NEW10' }));
  expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { usedCount: expect.anything() });
});

it('still produces discount: 0, no couponId when no couponCode is sent (backward compatible)', async () => {
  const response = await POST(makeRequest({ addressId: 'addr_1' }));
  expect(response.status).toBe(200);
  expect(mockBatchSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ discount: 0 })
  );
  const orderArg = mockBatchSet.mock.calls.find((call) => call[1]?.orderNo)?.[1];
  expect(orderArg?.couponId).toBeUndefined();
});
```

Adjust the exact mock names (`mockBatchSet`, `mockBatchUpdate`, `makeRequest`) to match whatever this test file's existing helpers are actually named — read the file first.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "checkout/create-order/route.test.ts"`
Expected: FAIL — new assertions don't match current hardcoded `discount: 0`/no coupon handling.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/api/checkout/create-order/route.ts`:

1. Add the import: `import { findCouponByCode } from '../../../../lib/coupon-lookup';` and `import { calculateCouponDiscount } from '@bro-pics/shared';` (merge into the existing `@bro-pics/shared` import line rather than adding a second one).
2. After parsing `addressId`, also parse: `const couponCode = typeof body?.couponCode === 'string' && body.couponCode.trim().length > 0 ? body.couponCode.trim() : null;` — optional, no validation failure if absent.
3. After `subtotal`/`shipping` are computed (where `const discount = 0;` currently sits), replace that line with:

```ts
let discount = 0;
let appliedCouponId: string | undefined;
let effectiveShipping = shipping;

if (couponCode) {
  const coupon = await findCouponByCode(db, couponCode);
  if (coupon) {
    let perUserOk = true;
    if (coupon.perUserLimit) {
      const usedSnapshot = await db.collection('orders').where('userId', '==', userId).where('couponId', '==', couponCode).get();
      perUserOk = usedSnapshot.size < coupon.perUserLimit;
    }
    if (perUserOk) {
      const result = calculateCouponDiscount(subtotal, coupon);
      if (result.valid) {
        discount = result.discountPaise;
        appliedCouponId = couponCode;
        if (coupon.type === 'free_ship') {
          effectiveShipping = 0;
        }
      }
    }
  }
  // A coupon that's unknown, expired, or otherwise invalid at order time
  // does NOT fail the order — it silently proceeds with discount: 0. See
  // this plan's design doc §3 for why (never block checkout over a
  // coupon race).
}

const total = subtotal - discount + effectiveShipping;
```

4. Update every later use of `shipping` in the `order` object construction to use `effectiveShipping` instead (the `OrderSchema.parse({...})` call's `shipping: shipping` becomes `shipping: effectiveShipping`).
5. Add `couponId: appliedCouponId,` to the `OrderSchema.parse({...})` call's fields (optional field, `undefined` when no coupon applied — matches the existing `razorpayPaymentId`/`notes`/`courier` optional-field pattern already in this schema/route).
6. After `batch.set(orderRef, order);`, add the usedCount increment (only when a coupon was actually applied):

```ts
if (appliedCouponId) {
  batch.update(db.collection('coupons').doc(appliedCouponId), { usedCount: FieldValue.increment(1) });
}
```

Add `FieldValue` to the existing `import { getFirestore } from 'firebase-admin/firestore';` line — it becomes `import { getFirestore, FieldValue } from 'firebase-admin/firestore';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "checkout/create-order/route.test.ts"`
Expected: PASS (all tests, existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/checkout/create-order/route.ts apps/web/app/api/checkout/create-order/route.test.ts
git commit -m "feat(checkout): apply real coupon discount in create-order (was hardcoded to 0)"
```

---

### Task 4: Seed data — make `NEW10` real

**Files:**
- Modify: `scripts/seed/src/data.ts`
- Modify: `scripts/seed/src/data.test.ts`
- Modify: `scripts/seed/src/write-to-firestore.ts`

**Interfaces:**
- Produces: `seedCoupons: Coupon[]` — consumed by Task 3's Cloud Firestore data (indirectly, once seeded) and by `write-to-firestore.ts`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/seed/src/data.test.ts`:

```ts
import { CouponSchema } from '@bro-pics/shared';
import { seedCoupons } from './data';
```

(merge into the file's existing import lines rather than adding duplicate import statements)

```ts
describe('seed coupons', () => {
  it('every seed coupon passes CouponSchema validation', () => {
    for (const coupon of seedCoupons) {
      expect(() => CouponSchema.parse(coupon)).not.toThrow();
    }
  });

  it('seeds a working NEW10 coupon matching the homepage banner', () => {
    const new10 = seedCoupons.find((c) => c.code === 'NEW10');
    expect(new10).toBeDefined();
    expect(new10?.type).toBe('percent');
    expect(new10?.value).toBe(10);
    expect(new10?.appliesTo).toBe('all');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/seed test -- data.test.ts`
Expected: FAIL — `seedCoupons` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to `scripts/seed/src/data.ts` (extend the top `import type` line to include `Coupon`, then add the array — placement anywhere among the other `export const seedX` arrays, e.g. near `seedHomepageSections` since it's thematically related to the offer-strip banner):

```ts
export const seedCoupons: Coupon[] = [
  {
    code: 'NEW10',
    type: 'percent',
    value: 10,
    appliesTo: 'all',
    startsAt: new Date('2024-01-01T00:00:00.000Z'),
    endsAt: new Date('2030-01-01T00:00:00.000Z'),
    usedCount: 0,
  },
];
```

Add to `scripts/seed/src/write-to-firestore.ts`: import `seedCoupons` alongside the other seed imports, add a staging loop (placed with the others, before the final `commits.push(batch.commit())`):

```ts
for (const coupon of seedCoupons) {
  stage(db.collection('coupons').doc(coupon.code), coupon);
}
```

Update the final `console.log` summary line to include `, ${seedCoupons.length} coupons` at the end.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/seed test -- data.test.ts`
Expected: PASS (all tests, existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/src/data.ts scripts/seed/src/data.test.ts scripts/seed/src/write-to-firestore.ts
git commit -m "feat(seed): add NEW10 coupon so the homepage banner actually works"
```

---

### Task 5: Checkout page coupon UI

**Files:**
- Modify: `apps/web/app/checkout/page.tsx`
- Create: `apps/web/app/checkout/page.test.tsx` (check first — if a test file for this page already exists under a different name, extend that instead of creating a duplicate)

**Interfaces:**
- Consumes: `POST /api/checkout/coupon/validate` (Task 2), sends `couponCode` in the existing `POST /api/checkout/create-order` body (Task 3).

- [ ] **Step 1: Write the failing test**

Create (or extend the existing) `apps/web/app/checkout/page.test.tsx`. This page has no client-side price breakdown beyond Subtotal today, and no existing test file was found in the earlier recon — if that's still true, create fresh, mocking `useAuth`, `useCart`, `AddressPicker`, `loadRazorpayCheckoutScript`, and `global.fetch` the same way other page tests in this codebase do (see `apps/web/app/staff/orders/page.test.tsx` for the general shape, adapted — this page has different dependencies, don't copy its staff-auth-flash logic, that doesn't apply here):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from './page';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';

vi.mock('../../lib/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/cart-context', () => ({ useCart: vi.fn() }));
vi.mock('../../components/checkout/AddressPicker', () => ({ AddressPicker: () => null }));
vi.mock('../../lib/razorpay-checkout-script', () => ({ loadRazorpayCheckoutScript: vi.fn() }));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn() }));

const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user_1', getIdToken: mockGetIdToken } } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useCart).mockReturnValue({ items: [{ variantId: 'v1', personalizationId: 'p1', title: 'Frame', qty: 1 }], totalPaise: 100000 } as unknown as ReturnType<typeof useCart>);
});

describe('CheckoutPage coupon UI', () => {
  it('shows the discount on a valid coupon', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true, discountPaise: 10000, freeShipping: false }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'NEW10' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await screen.findByText(/coupon.*NEW10.*applied/i)).toBeInTheDocument();
  });

  it('shows a human-readable message for an invalid coupon', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: false, reason: 'below_min_order' }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'BIGSPEND' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await screen.findByText(/minimum order not met/i)).toBeInTheDocument();
  });

  it('includes couponCode in the place-order request once applied', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true, discountPaise: 10000, freeShipping: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order_1', razorpayOrderId: 'rzp_1', amount: 90000, keyId: 'key_1' }) });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: 'NEW10' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await screen.findByText(/coupon.*NEW10.*applied/i);

    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/checkout/create-order',
        expect.objectContaining({ body: JSON.stringify({ addressId: null, couponCode: 'NEW10' }) })
      )
    );
  });
});
```

Adjust the third test's exact `addressId` expectation once you see how `addressId` state actually initializes in the real component (it may need an `AddressPicker`-triggered `onSelect` call first, depending on the mock) — the point of the test is proving `couponCode` is included, not re-testing the pre-existing address flow.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "checkout/page.test.tsx"`
Expected: FAIL — no coupon UI exists yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/checkout/page.tsx`:

1. Add state: `const [couponCodeInput, setCouponCodeInput] = useState('');`, `const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPaise: number; freeShipping: boolean } | null>(null);`, `const [couponMessage, setCouponMessage] = useState<string | null>(null);`.

2. Add a `REASON_MESSAGES` map near the top of the file (outside the component):

```ts
const COUPON_REASON_MESSAGES: Record<string, string> = {
  below_min_order: 'Minimum order not met',
  expired: "This coupon isn't active right now",
  not_started: "This coupon isn't active right now",
  usage_limit_reached: 'This coupon has reached its usage limit',
  per_user_limit_reached: 'This coupon has reached its usage limit',
};
```

3. Add a handler:

```ts
const handleApplyCoupon = async () => {
  setCouponMessage(null);
  const idToken = await user.getIdToken();
  const response = await fetch('/api/checkout/coupon/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code: couponCodeInput }),
  });
  if (response.status === 404) {
    setCouponMessage('Invalid coupon code.');
    return;
  }
  if (!response.ok) {
    setCouponMessage('Could not apply this coupon.');
    return;
  }
  const body = await response.json();
  if (!body.valid) {
    setCouponMessage(COUPON_REASON_MESSAGES[body.reason] ?? 'This coupon cannot be applied.');
    return;
  }
  setAppliedCoupon({ code: couponCodeInput, discountPaise: body.discountPaise, freeShipping: body.freeShipping });
};

const handleRemoveCoupon = () => {
  setAppliedCoupon(null);
  setCouponCodeInput('');
  setCouponMessage(null);
};
```

4. In `handlePlaceOrder`, change the fetch body to: `body: JSON.stringify({ addressId, couponCode: appliedCoupon?.code ?? undefined })` — note `JSON.stringify` drops `undefined` values, matching the "optional field, absent when not applicable" convention Task 3's route expects.

5. In the JSX, add a coupon section between the item list and the error/place-order block:

```tsx
<div className="flex flex-col gap-2 pt-2 border-t border-charcoal/10">
  {appliedCoupon ? (
    <div className="flex items-center justify-between text-sm">
      <span>
        Coupon <strong>{appliedCoupon.code}</strong> applied
        {appliedCoupon.freeShipping ? ' — free shipping' : ` — ₹${(appliedCoupon.discountPaise / 100).toFixed(2)} off`}
      </span>
      <button onClick={handleRemoveCoupon} className="text-xs underline">Remove</button>
    </div>
  ) : (
    <div className="flex gap-2">
      <label htmlFor="coupon-code" className="sr-only">Coupon code</label>
      <input
        id="coupon-code"
        value={couponCodeInput}
        onChange={(e) => setCouponCodeInput(e.target.value)}
        placeholder="Coupon code"
        className="rounded border border-charcoal/20 px-3 py-2 text-sm"
      />
      <button onClick={handleApplyCoupon} disabled={!couponCodeInput} className="rounded border border-charcoal/30 px-3 py-2 text-sm">
        Apply
      </button>
    </div>
  )}
  {couponMessage && <p className="text-xs text-red-600">{couponMessage}</p>}
</div>
```

Place this block inside the existing `!isPaid` branch, alongside the item list / Subtotal div (not inside the `isPaid` confirmation branch).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "checkout/page.test.tsx"`
Expected: PASS (all 3 new tests, plus any pre-existing tests in this file if one already existed)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/checkout/page.tsx apps/web/app/checkout/page.test.tsx
git commit -m "feat(checkout): add coupon code input to checkout page"
```

---

### Task 6: Full verification and `PROJECT_STATUS.md` update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including all new/modified files above.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean across every workspace with a `typecheck` script. This project has hit real typecheck-only failures in this exact plan's sibling (Phase 6 Plan A) that `pnpm -r test` alone didn't catch — do not skip this step or treat a green test run as sufficient.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a `6b` row to the §3 roadmap table for "Phase 6 Plan B — Coupon application at checkout", complete, on `feature/admin-panel-and-production-queue`, linking the design and plan docs (match the existing rows' exact format). Update §4's test count. Add a new §5 gap bullet: the coupon-application flow (validate route, create-order's discount/free-shipping application, the `usedCount` increment race — see this plan's design doc §3 for why that race is an accepted gap) has never run against the live project — same "never run live" category as the existing bullets, needs a real signed-in customer account with items in cart. Note explicitly that `appliesTo: 'category' | 'product'` restriction is NOT enforced (the schema doesn't carry a target field to enforce against — a real gap, not an oversight, flagged in the design doc §1) and that no live third-party integration was skipped in this plan.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 6 Plan B completion in PROJECT_STATUS.md"
```
