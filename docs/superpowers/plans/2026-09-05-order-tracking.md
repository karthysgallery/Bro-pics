# Phase 4 Plan C — Order Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manual AWB/status-timeline system — a minimal staff UI to advance an order through valid status transitions and record courier/tracking info, plus the customer-facing order history and tracking pages this project has stubbed out since Foundation.

**Architecture:** A new `OrderEventSchema` (one append-only doc per status change) backs both a staff-only Admin-SDK route pair (`GET`/`POST` under `/api/staff/orders/[orderNo]`) and the customer-facing pages, which read `orders/{orderId}/events` directly via the client Firestore SDK under rules that already exist. A pure `isValidStatusTransition` function is the single source of truth for what transitions are legal, referenced by both the write route and the staff UI's own status picker. Staff authorization is a Firebase Auth custom claim (`role: 'admin' | 'staff'`), bootstrapped by a one-time manual script — there is no in-app role-management UI this plan.

**Tech Stack:** Next.js App Router (API routes + client/server components), Firebase Admin SDK (Firestore transactions, Auth `verifyIdToken`), Firebase client SDK (`onSnapshot`-free direct reads via `getDocs`), zod, Vitest.

## Global Constraints

- No staff order list/production queue — the staff UI looks up exactly one order at a time by order number. A list view is Phase 5's job.
- No courier API integration — AWB numbers are typed in by hand.
- No role-management UI — granting `admin`/`staff` is a one-time manual script, not an app feature.
- The event timeline is append-only — no task edits or deletes a past `OrderEvent`.
- No customer-initiated actions (cancel, replacement request) — customers only ever read the timeline.
- `courier`/`awbNumber` are required together, and only when advancing an order to `shipped`.

---

### Task 1: `OrderEventSchema` + `OrderSchema` courier/AWB fields

**Files:**
- Create: `packages/shared/src/schemas/order-event.ts`
- Modify: `packages/shared/src/schemas/order.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/order-event.test.ts`
- Test: `packages/shared/src/schemas/order.test.ts` (existing — extend)

**Interfaces:**
- Produces: `OrderEventSchema`, `type OrderEvent` (`{id, status, note, courier, awbNumber, createdAt, createdBy}`), exported from `@bro-pics/shared`. `OrderSchema` gains `courier?: string`, `awbNumber?: string` (both optional, no change to the existing money-invariant `.superRefine`). Consumed by Task 5 (writing events + updating orders) and Tasks 7-9 (reading them).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/schemas/order-event.test.ts
import { describe, it, expect } from 'vitest';
import { OrderEventSchema } from './order-event';

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    status: 'shipped',
    note: null,
    courier: 'BlueDart',
    awbNumber: 'BD123456789',
    createdAt: '2026-09-05T00:00:00.000Z',
    createdBy: 'staff_uid_1',
    ...overrides,
  };
}

describe('OrderEventSchema', () => {
  it('accepts a full valid shipped event', () => {
    expect(OrderEventSchema.safeParse(baseEvent()).success).toBe(true);
  });

  it('accepts a non-shipped event with null courier/awbNumber/note', () => {
    const result = OrderEventSchema.safeParse(
      baseEvent({ status: 'in_production', courier: null, awbNumber: null })
    );
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    expect(OrderEventSchema.safeParse(baseEvent({ status: 'shipped_out' })).success).toBe(false);
  });

  it('rejects a missing createdBy', () => {
    const { createdBy: _drop, ...rest } = baseEvent();
    expect(OrderEventSchema.safeParse(rest).success).toBe(false);
  });
});
```

```ts
// packages/shared/src/schemas/order.test.ts — ADD to the existing describe block
describe('OrderSchema courier/awbNumber', () => {
  it('accepts an order with courier and awbNumber set', () => {
    const result = OrderSchema.safeParse(baseOrder({ courier: 'BlueDart', awbNumber: 'BD123456789' }));
    expect(result.success).toBe(true);
  });

  it('accepts an order with neither field set (pre-shipping)', () => {
    expect(OrderSchema.safeParse(baseOrder()).success).toBe(true);
  });
});
```

(`baseOrder(...)` is the existing helper already defined in this test file from Plan B's money-invariant tests — reuse it, don't redefine it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `Cannot find module './order-event'`

- [ ] **Step 3: Write the schema and field additions**

```ts
// packages/shared/src/schemas/order-event.ts
import { z } from 'zod';
import { OrderStatusSchema } from './order';

export const OrderEventSchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  note: z.string().nullable(),
  courier: z.string().nullable(),
  awbNumber: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;
```

```ts
// packages/shared/src/schemas/order.ts — add two fields to the existing z.object({...}) definition,
// anywhere among the other optional fields (e.g. next to razorpayPaymentId/notes):
    courier: z.string().optional(),
    awbNumber: z.string().optional(),
```

(The `.superRefine(...)` wrapper and its two money-invariant checks stay exactly as Plan B left them — this task only adds the two new fields to the object passed into it.)

```ts
// packages/shared/src/index.ts — add
export * from './schemas/order-event';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/order-event.ts packages/shared/src/schemas/order-event.test.ts packages/shared/src/schemas/order.ts packages/shared/src/schemas/order.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add OrderEventSchema and courier/awbNumber fields on OrderSchema"
```

---

### Task 2: `isValidStatusTransition`

**Files:**
- Create: `packages/shared/src/orders/status-transitions.ts`
- Test: `packages/shared/src/orders/status-transitions.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `type OrderStatus` (existing, from `./schemas/order`).
- Produces: `isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean`, exported from `@bro-pics/shared`. Consumed by Task 5 (the advance route) and Task 7 (the staff UI's status picker).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/orders/status-transitions.test.ts
import { describe, it, expect } from 'vitest';
import { isValidStatusTransition } from './status-transitions';
import type { OrderStatus } from '../schemas/order';

describe('isValidStatusTransition — happy path', () => {
  const happyPath: OrderStatus[] = [
    'pending_payment',
    'paid',
    'in_production',
    'printed_packed',
    'shipped',
    'delivered',
  ];

  it('allows each step to its immediate successor', () => {
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isValidStatusTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('rejects skipping a step', () => {
    expect(isValidStatusTransition('pending_payment', 'in_production')).toBe(false);
    expect(isValidStatusTransition('paid', 'shipped')).toBe(false);
    expect(isValidStatusTransition('pending_payment', 'delivered')).toBe(false);
  });

  it('rejects going backward', () => {
    expect(isValidStatusTransition('shipped', 'paid')).toBe(false);
    expect(isValidStatusTransition('delivered', 'shipped')).toBe(false);
  });
});

describe('isValidStatusTransition — cancelled branch', () => {
  it('allows cancelled from pending_payment, paid, or in_production', () => {
    expect(isValidStatusTransition('pending_payment', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('paid', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('in_production', 'cancelled')).toBe(true);
  });

  it('rejects cancelled once printed_packed or later', () => {
    expect(isValidStatusTransition('printed_packed', 'cancelled')).toBe(false);
    expect(isValidStatusTransition('shipped', 'cancelled')).toBe(false);
    expect(isValidStatusTransition('delivered', 'cancelled')).toBe(false);
  });
});

describe('isValidStatusTransition — refunded branch', () => {
  it('allows refunded from paid, in_production, printed_packed, shipped, or delivered', () => {
    for (const from of ['paid', 'in_production', 'printed_packed', 'shipped', 'delivered'] as OrderStatus[]) {
      expect(isValidStatusTransition(from, 'refunded')).toBe(true);
    }
  });

  it('rejects refunded from pending_payment', () => {
    expect(isValidStatusTransition('pending_payment', 'refunded')).toBe(false);
  });
});

describe('isValidStatusTransition — replacement_issued branch', () => {
  it('allows replacement_issued from shipped or delivered only', () => {
    expect(isValidStatusTransition('shipped', 'replacement_issued')).toBe(true);
    expect(isValidStatusTransition('delivered', 'replacement_issued')).toBe(true);
  });

  it('rejects replacement_issued before shipped', () => {
    expect(isValidStatusTransition('printed_packed', 'replacement_issued')).toBe(false);
    expect(isValidStatusTransition('paid', 'replacement_issued')).toBe(false);
  });
});

describe('isValidStatusTransition — terminal states', () => {
  it('rejects every outbound transition from cancelled, refunded, and replacement_issued', () => {
    const terminal: OrderStatus[] = ['cancelled', 'refunded', 'replacement_issued'];
    const anyOther: OrderStatus[] = ['pending_payment', 'paid', 'in_production', 'printed_packed', 'shipped', 'delivered'];
    for (const from of terminal) {
      for (const to of [...anyOther, ...terminal]) {
        if (from === to) continue;
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `Cannot find module './status-transitions'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/orders/status-transitions.ts
import type { OrderStatus } from '../schemas/order';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['in_production', 'cancelled', 'refunded'],
  in_production: ['printed_packed', 'cancelled', 'refunded'],
  printed_packed: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded', 'replacement_issued'],
  delivered: ['refunded', 'replacement_issued'],
  cancelled: [],
  refunded: [],
  replacement_issued: [],
};

/**
 * The single source of truth for which order-status transitions are legal.
 * Referenced by both the staff-advance route (server-side enforcement) and
 * the staff UI's status picker (so the UI never even offers an invalid
 * choice) — kept in packages/shared specifically so those two can't drift.
 */
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

```ts
// packages/shared/src/index.ts — add
export * from './orders/status-transitions';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/orders/status-transitions.ts packages/shared/src/orders/status-transitions.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add isValidStatusTransition as the single source of truth for order status changes"
```

---

### Task 3: `getStaffUserIdFromAuthHeader`

**Files:**
- Modify: `apps/web/lib/verify-id-token.ts`
- Test: `apps/web/lib/verify-id-token.test.ts` (existing — extend)

**Interfaces:**
- Consumes: nothing new (same `firebase-admin/auth`/`getAdminApp()` this file already imports).
- Produces: `getStaffUserIdFromAuthHeader(request: Request): Promise<string | null>`, exported alongside the existing `getUserIdFromAuthHeader`. Consumed by Tasks 4 and 5 (both staff routes). **A `null` return here always means the caller should respond `403`** — unlike `getUserIdFromAuthHeader`, where `null` means "proceed as signed out," this helper's whole purpose is gating a privileged action.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/lib/verify-id-token.test.ts — ADD to the existing describe blocks,
// reusing the same mockVerifyIdToken/vi.mock('firebase-admin/auth', ...) setup
// already in this file for getUserIdFromAuthHeader's tests.
describe('getStaffUserIdFromAuthHeader', () => {
  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://example.com', { headers: {} });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns the uid when the token verifies and role is admin', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_1', role: 'admin' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBe('staff_1');
  });

  it('returns the uid when the token verifies and role is staff', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_2', role: 'staff' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBe('staff_2');
  });

  it('returns null when the token verifies but role is neither admin nor staff', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'customer_1' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer bad-token' } });
    expect(await getStaffUserIdFromAuthHeader(request)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token`
Expected: FAIL — `getStaffUserIdFromAuthHeader is not a function` (or similar)

- [ ] **Step 3: Implement it**

```ts
// apps/web/lib/verify-id-token.ts — add below the existing getUserIdFromAuthHeader

/**
 * Like getUserIdFromAuthHeader, but ALSO requires the decoded token's role
 * claim to be 'admin' or 'staff' — mirroring firestore.rules' isStaffOrAdmin()
 * exactly. Unlike getUserIdFromAuthHeader, a null return here is never
 * "proceed as signed out" — it always means the caller must respond 403.
 */
export async function getStaffUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    const role = (decoded as { role?: string }).role;
    if (role !== 'admin' && role !== 'staff') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token`
Expected: PASS

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/verify-id-token.ts apps/web/lib/verify-id-token.test.ts
git commit -m "feat(web): add getStaffUserIdFromAuthHeader for staff-only routes"
```

---

### Task 4: `GET /api/staff/orders/[orderNo]`

**Files:**
- Create: `apps/web/lib/order-lookup.ts`
- Create: `apps/web/app/api/staff/orders/[orderNo]/route.ts`
- Test: `apps/web/lib/order-lookup.test.ts`
- Test: `apps/web/app/api/staff/orders/[orderNo]/route.test.ts`

**Interfaces:**
- Consumes: `getStaffUserIdFromAuthHeader` (Task 3).
- Produces: `findOrderByOrderNo(db: Firestore, orderNo: string): Promise<{id: string; data: Order} | null>` from `apps/web/lib/order-lookup.ts` — consumed by this task's route AND Task 5's advance route (shared lookup, avoids duplicating the query). `GET /api/staff/orders/[orderNo]` — `403` if not staff, `404` if no matching order, else `200 {order, items}` (`items` from `orders/{orderId}/items`).

- [ ] **Step 1: Write the failing test for the lookup helper**

```ts
// apps/web/lib/order-lookup.test.ts
import { describe, it, expect, vi } from 'vitest';
import { findOrderByOrderNo } from './order-lookup';

function makeFakeDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            empty: docs.length === 0,
            docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
          }),
        })),
      })),
    })),
  };
}

describe('findOrderByOrderNo', () => {
  it('returns the matching order with its id when found', async () => {
    const db = makeFakeDb([{ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } }]);
    const result = await findOrderByOrderNo(db as never, 'BP-2026-00001');
    expect(result).toEqual({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } });
  });

  it('returns null when no order matches', async () => {
    const db = makeFakeDb([]);
    const result = await findOrderByOrderNo(db as never, 'BP-2026-99999');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- order-lookup`
Expected: FAIL — `Cannot find module './order-lookup'`

- [ ] **Step 3: Implement the lookup helper**

```ts
// apps/web/lib/order-lookup.ts
import type { Firestore } from 'firebase-admin/firestore';
import type { Order } from '@bro-pics/shared';

/**
 * orderNo is a display identifier (BP-2026-00001), not the Firestore
 * document id — this looks it up via a single-field equality query
 * (auto-indexed, no composite index needed), matching the same
 * where('razorpayOrderId', '==', ...) pattern the Razorpay webhook already
 * uses to find an order by a non-doc-id field.
 */
export async function findOrderByOrderNo(
  db: Firestore,
  orderNo: string
): Promise<{ id: string; data: Order } | null> {
  const snapshot = await db.collection('orders').where('orderNo', '==', orderNo).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as Order };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- order-lookup`
Expected: PASS

- [ ] **Step 5: Write the failing tests for the route**

```ts
// apps/web/app/api/staff/orders/[orderNo]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrder = vi.fn();
vi.mock('../../../../../lib/order-lookup', () => ({ findOrderByOrderNo: (...args: unknown[]) => mockFindOrder(...args) }));

const mockItemsGet = vi.fn();
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => ({ get: mockItemsGet })) })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/orders/BP-2026-00001', { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/orders/[orderNo]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 when no order matches the order number', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce(null);
    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-99999' }) });
    expect(response.status).toBe(404);
  });

  it('returns the order and its items on success', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid' } });
    mockItemsGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'item_1', title: 'Frame' }) }] });

    const response = await GET(makeRequest(), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.order).toEqual({ orderNo: 'BP-2026-00001', status: 'paid' });
    expect(body.items).toEqual([{ id: 'item_1', title: 'Frame' }]);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- staff/orders`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 7: Implement the route**

```ts
// apps/web/app/api/staff/orders/[orderNo]/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { findOrderByOrderNo } from '../../../../../lib/order-lookup';
import type { OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderNo: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { orderNo } = await params;
  const db = getFirestore(getAdminApp());
  const found = await findOrderByOrderNo(db, orderNo);
  if (!found) {
    return NextResponse.json({ error: `Unknown orderNo: ${orderNo}` }, { status: 404 });
  }

  const itemsSnapshot = await db.collection('orders').doc(found.id).collection('items').get();
  const items = itemsSnapshot.docs.map((doc) => doc.data() as OrderItem);

  return NextResponse.json({ order: found.data, items }, { status: 200 });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- staff/orders`
Expected: PASS

- [ ] **Step 9: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/order-lookup.ts apps/web/lib/order-lookup.test.ts apps/web/app/api/staff/orders/[orderNo]/route.ts apps/web/app/api/staff/orders/[orderNo]/route.test.ts
git commit -m "feat(web): add staff order lookup (GET /api/staff/orders/[orderNo])"
```

---

### Task 5: `POST /api/staff/orders/[orderNo]/advance`

**Files:**
- Create: `apps/web/app/api/staff/orders/[orderNo]/advance/route.ts`
- Test: `apps/web/app/api/staff/orders/[orderNo]/advance/route.test.ts`

**Interfaces:**
- Consumes: `getStaffUserIdFromAuthHeader` (Task 3), `findOrderByOrderNo` (Task 4), `isValidStatusTransition` (Task 2), `OrderEventSchema`/`OrderSchema` (Task 1, both from `@bro-pics/shared`).
- Produces: `POST /api/staff/orders/[orderNo]/advance` — request `{status: OrderStatus, note?: string, courier?: string, awbNumber?: string}` + `Authorization: Bearer <idToken>`; response `200 {order}` on success, `403` not staff, `404` unknown order, `400` (missing courier/awbNumber when advancing to `shipped`, or an invalid transition). Consumed by Task 7 (the staff UI).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/app/api/staff/orders/[orderNo]/advance/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrder = vi.fn();
vi.mock('../../../../../../lib/order-lookup', () => ({ findOrderByOrderNo: (...args: unknown[]) => mockFindOrder(...args) }));

const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id?: string) => ({
      id: id ?? 'generated_id',
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'event_1' })) })),
    })),
  })),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/orders/BP-2026-00001/advance', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/orders/[orderNo]/advance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: mockTransactionGet, set: mockTransactionSet, update: mockTransactionUpdate })
    );
  });

  it('returns 403 when the caller is not staff', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 when no order matches the order number', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ status: 'paid' }), { params: Promise.resolve({ orderNo: 'BP-2026-99999' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 when advancing to shipped without courier/awbNumber', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'printed_packed' } });
    const response = await POST(makeRequest({ status: 'shipped' }), { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status transition', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'pending_payment' } });
    const response = await POST(makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123' }), {
      params: Promise.resolve({ orderNo: 'BP-2026-00001' }),
    });
    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('advances a valid transition, writes an event, and updates the order', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'in_production', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });

    const response = await POST(
      makeRequest({ status: 'printed_packed', note: 'Ready for pickup' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'printed_packed', note: 'Ready for pickup', createdBy: 'staff_1' })
    );
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'printed_packed' })
    );
  });

  it('sets courier/awbNumber on the order when advancing to shipped', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrder.mockResolvedValueOnce({
      id: 'order_1',
      data: { id: 'order_1', orderNo: 'BP-2026-00001', status: 'printed_packed', subtotal: 1000, discount: 0, shipping: 0, total: 1000 },
    });

    const response = await POST(
      makeRequest({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' }),
      { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }
    );

    expect(response.status).toBe(200);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'shipped', courier: 'BlueDart', awbNumber: 'BD123456789' })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- advance`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/staff/orders/[orderNo]/advance/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { findOrderByOrderNo } from '../../../../../../lib/order-lookup';
import { OrderEventSchema, isValidStatusTransition, type OrderStatus } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderNo: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { orderNo } = await params;
  const db = getFirestore(getAdminApp());
  const found = await findOrderByOrderNo(db, orderNo);
  if (!found) {
    return NextResponse.json({ error: `Unknown orderNo: ${orderNo}` }, { status: 404 });
  }

  const body = await request.json();
  const status = body?.status as OrderStatus | undefined;
  const note = typeof body?.note === 'string' ? body.note : null;
  const courier = typeof body?.courier === 'string' ? body.courier : undefined;
  const awbNumber = typeof body?.awbNumber === 'string' ? body.awbNumber : undefined;

  if (!status) {
    return NextResponse.json({ error: 'Missing status' }, { status: 400 });
  }
  if (status === 'shipped' && (!courier || !awbNumber)) {
    return NextResponse.json({ error: 'courier and awbNumber are required when advancing to shipped' }, { status: 400 });
  }
  if (!isValidStatusTransition(found.data.status, status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${found.data.status} to ${status}` },
      { status: 400 }
    );
  }

  const orderRef = db.collection('orders').doc(found.id);
  const eventRef = orderRef.collection('events').doc();

  await db.runTransaction(async (transaction) => {
    const event = OrderEventSchema.parse({
      id: eventRef.id,
      status,
      note,
      courier: status === 'shipped' ? courier : null,
      awbNumber: status === 'shipped' ? awbNumber : null,
      createdAt: new Date().toISOString(),
      createdBy: staffUserId,
    });
    transaction.set(eventRef, event);

    const orderUpdate: Record<string, unknown> = { status };
    if (status === 'shipped') {
      orderUpdate.courier = courier;
      orderUpdate.awbNumber = awbNumber;
    }
    transaction.update(orderRef, orderUpdate);
  });

  return NextResponse.json({ order: { ...found.data, status } }, { status: 200 });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- advance`
Expected: PASS

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/staff/orders/[orderNo]/advance/route.ts apps/web/app/api/staff/orders/[orderNo]/advance/route.test.ts
git commit -m "feat(web): add POST /api/staff/orders/[orderNo]/advance"
```

---

### Task 6: Role-claim bootstrap script

**Files:**
- Create: `scripts/seed/src/load-env.ts`
- Modify: `scripts/seed/src/write-to-firestore.ts`
- Create: `scripts/seed/src/set-user-role.ts`
- Modify: `scripts/seed/package.json`

**Interfaces:**
- Produces: `loadEnvLocal(): void` extracted into its own file (previously inline in `write-to-firestore.ts`), reused by both scripts. `scripts/seed/src/set-user-role.ts` — a CLI script, not an importable module (no exports consumed by other tasks).

> **This is a manual, one-time step — not something a task runs unattended against a live account.** Implementing and unit-testing this script is this task's job; actually RUNNING it against the live `bropics-app` project (to create a real staff account) is a manual step for the user, called out again in Task 10.

- [ ] **Step 1: Extract `loadEnvLocal` into its own file**

Read `scripts/seed/src/write-to-firestore.ts` in full first — it currently has a `loadEnvLocal()` function defined inline (reads `apps/web/.env.local`, hand-parses `KEY=value` lines into `process.env`). Move that function, unchanged, into a new file:

```ts
// scripts/seed/src/load-env.ts
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnvLocal(): void {
  const envPath = join(__dirname, '..', '..', '..', 'apps', 'web', '.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`Expected env file not found at ${envPath}`);
  }
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
```

Then in `write-to-firestore.ts`, remove the inline `loadEnvLocal` function and replace it with an import:

```ts
// scripts/seed/src/write-to-firestore.ts — add near the top
import { loadEnvLocal } from './load-env';
```

(Delete the old inline `function loadEnvLocal(): void { ... }` block and its now-unused `readFileSync`/`existsSync`/`join`/`dirname`/`fileURLToPath`/`__dirname` imports/declarations if nothing else in the file uses them — check first, since `main()` still calls `loadEnvLocal()`, just via the import now.)

- [ ] **Step 2: Run the seed package's existing tests to confirm nothing broke**

Run: `pnpm --filter @bro-pics/seed test`
Expected: PASS (this refactor changes no behavior, just moves code)

- [ ] **Step 3: Write `set-user-role.ts`**

```ts
// scripts/seed/src/set-user-role.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { loadEnvLocal } from './load-env';

async function main(): Promise<void> {
  const [uid, role] = process.argv.slice(2);
  if (!uid || (role !== 'admin' && role !== 'staff')) {
    console.error('Usage: pnpm --filter @bro-pics/seed set-user-role <uid> <admin|staff>');
    process.exit(1);
  }

  loadEnvLocal();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');

  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  await getAuth(app).setCustomUserClaims(uid, { role });

  console.log(`Set role '${role}' on user ${uid}. They must sign out and back in (or refresh their ID token) for this to take effect.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Wire the script into `package.json`**

```json
// scripts/seed/package.json — add to "scripts"
"set-user-role": "tsx src/set-user-role.ts"
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bro-pics/seed typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/seed/src/load-env.ts scripts/seed/src/write-to-firestore.ts scripts/seed/src/set-user-role.ts scripts/seed/package.json
git commit -m "feat(seed): add a one-time role-claim bootstrap script for staff accounts"
```

---

### Task 7: Minimal staff UI

**Files:**
- Create: `apps/web/app/staff/orders/page.tsx`
- Test: `apps/web/app/staff/orders/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (existing, Plan A), `isValidStatusTransition` (Task 2, from `@bro-pics/shared`), `GET`/`POST /api/staff/orders/[orderNo]` (Tasks 4-5).
- Produces: the `/staff/orders` page. No exports consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/app/staff/orders/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StaffOrdersPage from './page';

const mockGetIdTokenResult = vi.fn();
const mockGetIdToken = vi.fn().mockResolvedValue('id-token');
vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'staff_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
    loading: false,
  })),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('StaffOrdersPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('shows "Not authorized" when the signed-in user has no staff/admin role claim', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: {} });
    render(<StaffOrdersPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('looks up an order and shows a status-advance form for a staff user', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'staff' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          order: { orderNo: 'BP-2026-00001', status: 'printed_packed' },
          items: [{ title: 'Frame', qty: 1 }],
        }),
    });

    render(<StaffOrdersPage />);
    fireEvent.change(await screen.findByLabelText('Order number'), { target: { value: 'BP-2026-00001' } });
    fireEvent.click(screen.getByText('Look up'));

    await waitFor(() => expect(screen.getByText('Frame')).toBeInTheDocument());
    // printed_packed's only valid next steps are shipped and refunded — courier/AWB
    // fields should NOT show until 'shipped' is actually selected.
    expect(screen.queryByLabelText('Courier')).not.toBeInTheDocument();
  });

  it('shows courier/AWB fields only when the selected next status is shipped, and submits the advance', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ order: { orderNo: 'BP-2026-00001', status: 'printed_packed' }, items: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ order: { orderNo: 'BP-2026-00001', status: 'shipped' } }) });

    render(<StaffOrdersPage />);
    fireEvent.change(await screen.findByLabelText('Order number'), { target: { value: 'BP-2026-00001' } });
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() => screen.getByLabelText('Next status'));

    fireEvent.change(screen.getByLabelText('Next status'), { target: { value: 'shipped' } });
    expect(await screen.findByLabelText('Courier')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Courier'), { target: { value: 'BlueDart' } });
    fireEvent.change(screen.getByLabelText('AWB / tracking number'), { target: { value: 'BD123456789' } });
    fireEvent.click(screen.getByText('Advance'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/staff/orders/BP-2026-00001/advance',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
          body: JSON.stringify({ status: 'shipped', note: '', courier: 'BlueDart', awbNumber: 'BD123456789' }),
        })
      )
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- staff/orders/page`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the page**

```tsx
// apps/web/app/staff/orders/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { isValidStatusTransition, type Order, type OrderItem, type OrderStatus } from '@bro-pics/shared';

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'in_production',
  'printed_packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'replacement_issued',
];

export default function StaffOrdersPage() {
  const { user } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orderNoInput, setOrderNoInput] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdTokenResult().then((result) => {
      const role = result.claims.role;
      setAuthorized(role === 'admin' || role === 'staff');
    });
  }, [user]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    setError(null);
    setOrder(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNoInput}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      setError('Order not found.');
      return;
    }
    const body = await response.json();
    setOrder(body.order);
    setItems(body.items ?? []);
    setNextStatus('');
    setCourier('');
    setAwbNumber('');
  };

  const handleAdvance = async () => {
    if (!order || !nextStatus) return;
    setError(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNoInput}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ status: nextStatus, note, courier, awbNumber }),
    });
    if (!response.ok) {
      setError('Could not advance the order.');
      return;
    }
    const body = await response.json();
    setOrder(body.order);
    setNextStatus('');
    setNote('');
    setCourier('');
    setAwbNumber('');
  };

  const validNextStatuses = order ? ALL_STATUSES.filter((s) => isValidStatusTransition(order.status, s)) : [];

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Order Lookup</h1>

      <label htmlFor="order-no-input">Order number</label>
      <input
        id="order-no-input"
        value={orderNoInput}
        onChange={(e) => setOrderNoInput(e.target.value)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      />
      <button onClick={handleLookup} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Look up
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {order && (
        <div className="flex flex-col gap-3 pt-4 border-t border-charcoal/10">
          <p>Current status: {order.status}</p>
          <ul>
            {items.map((item, i) => (
              <li key={i}>{item.title}</li>
            ))}
          </ul>

          <label htmlFor="next-status">Next status</label>
          <select
            id="next-status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
            className="rounded border border-charcoal/20 px-3 py-2 w-fit"
          >
            <option value="">Select…</option>
            {validNextStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label htmlFor="advance-note">Note (optional)</label>
          <textarea id="advance-note" value={note} onChange={(e) => setNote(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

          {nextStatus === 'shipped' && (
            <>
              <label htmlFor="courier-input">Courier</label>
              <input id="courier-input" value={courier} onChange={(e) => setCourier(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />
              <label htmlFor="awb-input">AWB / tracking number</label>
              <input id="awb-input" value={awbNumber} onChange={(e) => setAwbNumber(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />
            </>
          )}

          <button onClick={handleAdvance} disabled={!nextStatus} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
            Advance
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- staff/orders/page`
Expected: PASS

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/staff/orders/page.tsx apps/web/app/staff/orders/page.test.tsx
git commit -m "feat(web): add minimal staff order-lookup and status-advance page"
```

---

### Task 8: Customer order list page

**Files:**
- Modify: `apps/web/app/(account)/orders/page.tsx`
- Test: `apps/web/app/(account)/orders/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (existing, Plan A), `getFirebaseApp()` (existing).
- Produces: the `(account)/orders` list page. No exports consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/app/(account)/orders/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrdersPage from './page';

vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
}));

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(orders: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: orders.map((o) => ({ id: o.id, data: () => o.data })) };
}

describe('OrdersPage (customer order list)', () => {
  it('shows an empty state with no orders', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([]));
    render(<OrdersPage />);
    expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
  });

  it('lists orders with a link to each detail page', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([{ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'shipped', total: 105000 } }])
    );
    render(<OrdersPage />);
    const link = await screen.findByText('BP-2026-00001');
    expect(link.closest('a')).toHaveAttribute('href', '/account/orders/order_1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- "(account)/orders/page"`
Expected: FAIL — the current stub has neither an empty state nor an order list

- [ ] **Step 3: Implement the page**

```tsx
// apps/web/app/(account)/orders/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../lib/auth-context';
import { getFirebaseApp } from '../../../lib/firebase-client';
import type { Order } from '@bro-pics/shared';

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Array<{ id: string; data: Order }> | null>(null);

  useEffect(() => {
    if (!user) return;
    const db = getFirestore(getFirebaseApp());
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('placedAt', 'desc'));
    getDocs(q).then((snapshot) => {
      setOrders(snapshot.docs.map((d) => ({ id: d.id, data: d.data() as Order })));
    });
  }, [user]);

  if (!user) return <p>Please sign in to see your orders.</p>;
  if (orders === null) return <p>Loading…</p>;

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Your Orders</h1>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map(({ id, data }) => (
            <li key={id}>
              <Link href={`/account/orders/${id}`} className="flex justify-between gap-4">
                <span>{data.orderNo}</span>
                <span>{data.status}</span>
                <span>₹{formatPaise(data.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- "(account)/orders/page"`
Expected: PASS

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(account)/orders/page.tsx" "apps/web/app/(account)/orders/page.test.tsx"
git commit -m "feat(web): replace the orders stub with a real customer order list"
```

---

### Task 9: Customer order detail page

**Files:**
- Create: `apps/web/app/(account)/orders/[orderId]/page.tsx`
- Test: `apps/web/app/(account)/orders/[orderId]/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `getFirebaseApp()` (existing).
- Produces: the order detail page. No exports consumed by other tasks.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/app/(account)/orders/[orderId]/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrderDetailPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
}));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('OrderDetailPage', () => {
  it('renders line items and the event timeline in chronological order', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00001', status: 'shipped', total: 105000 }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'item_1', title: 'Classic Wooden Frame', qty: 1 }) }] })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'evt_1', status: 'paid', note: null, courier: null, awbNumber: null, createdAt: '2026-09-01T00:00:00.000Z' }) },
          { data: () => ({ id: 'evt_2', status: 'shipped', note: null, courier: 'BlueDart', awbNumber: 'BD123', createdAt: '2026-09-03T00:00:00.000Z' }) },
        ],
      });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_1' })} />);

    expect(await screen.findByText('Classic Wooden Frame')).toBeInTheDocument();
    const statusEls = await screen.findAllByText(/paid|shipped/);
    // 'paid' event should render before 'shipped' event, per the oldest-first ordering
    expect(statusEls[0].textContent).toContain('paid');
    expect(await screen.findByText('BlueDart')).toBeInTheDocument();
    expect(await screen.findByText('BD123')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "orders/\[orderId\]/page"`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the page**

```tsx
// apps/web/app/(account)/orders/[orderId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getFirestore, doc, getDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import type { Order, OrderItem, OrderEvent } from '@bro-pics/shared';

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { user } = useAuth();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);

  useEffect(() => {
    params.then((p) => setOrderId(p.orderId));
  }, [params]);

  useEffect(() => {
    if (!user || !orderId) return;
    const db = getFirestore(getFirebaseApp());

    getDoc(doc(db, 'orders', orderId)).then((snapshot) => {
      if (snapshot.exists()) setOrder(snapshot.data() as Order);
    });
    getDocs(collection(db, 'orders', orderId, 'items')).then((snapshot) => {
      setItems(snapshot.docs.map((d) => d.data() as OrderItem));
    });
    getDocs(query(collection(db, 'orders', orderId, 'events'), orderBy('createdAt', 'asc'))).then((snapshot) => {
      setEvents(snapshot.docs.map((d) => d.data() as OrderEvent));
    });
  }, [user, orderId]);

  if (!user) return <p>Please sign in to see this order.</p>;
  if (!order) return <p>Loading…</p>;

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-2xl">Order {order.orderNo}</h1>

      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i}>{item.title} × {item.qty}</li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-4 border-t border-charcoal/10">
        <h2 className="font-medium">Status timeline</h2>
        {events.map((event) => (
          <div key={event.id} className="text-sm">
            <span>{event.status}</span>
            {event.note && <span> — {event.note}</span>}
            {event.courier && <span> — {event.courier}</span>}
            {event.awbNumber && <span> ({event.awbNumber})</span>}
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "orders/\[orderId\]/page"`
Expected: PASS

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test`
Run: `pnpm --filter @bro-pics/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(account)/orders/[orderId]/page.tsx" "apps/web/app/(account)/orders/[orderId]/page.test.tsx"
git commit -m "feat(web): add customer order detail page with status timeline"
```

---

### Task 10: Live verification

**Files:** none created or modified — this is a verification-only task.

**Interfaces:** none.

> **Prerequisite, manual checkpoint:** a real Firebase Auth account (the user's own, or a test account) needs the `admin` or `staff` role claim set via Task 6's script — `pnpm --filter @bro-pics/seed set-user-role <uid> admin` — run manually against the live `bropics-app` project. The UID comes from Firebase Console → Authentication → Users, for whichever account will act as staff. If this hasn't been done yet, stop and ask the user to do it now.

- [ ] **Step 1: Start the dev server**

Run: `pnpm --filter @bro-pics/web dev`

- [ ] **Step 2: Place a real order to advance**

Either reuse an order created during Plan B's own live verification (if one exists and is still `pending_payment`/`paid`), or place a fresh one: sign in, personalize a seeded product, check out with a Razorpay test-mode payment (per Plan B's Task 10 setup).

- [ ] **Step 3: Sign out and back in as the staff account**

The role claim set in the prerequisite only takes effect on a fresh ID token — sign out and back in (or otherwise force a token refresh) with the account that was granted the role.

- [ ] **Step 4: Advance the order through several transitions at `/staff/orders`**

Look up the order by its order number. Advance it through at least: `paid → in_production → printed_packed → shipped` (entering a real courier name and AWB number at the `shipped` step) `→ delivered`. Confirm each advance succeeds and the displayed current status updates.

- [ ] **Step 5: Verify the customer-facing page reflects every change**

As the customer account (or in a second browser/incognito session), visit `/account/orders`, confirm the order appears with its current status, click into it, and confirm the full event timeline shows every transition in order, with the courier/AWB visible on the `shipped` event.

- [ ] **Step 6: Verify an invalid transition is rejected**

At `/staff/orders`, attempt to advance a `delivered` order to `in_production` (or any other invalid transition) — confirm the UI's own status picker doesn't even offer it (since `isValidStatusTransition` constrains the `<select>`'s options), and if you bypass that by calling the API directly, confirm the server rejects it with `400`.

- [ ] **Step 7: Verify staff-gating actually blocks a non-staff account**

Sign in as a regular customer account (no role claim) and attempt to visit `/staff/orders` — confirm it shows "Not authorized," and confirm a direct API call to `/api/staff/orders/<real-order-no>/advance` with that account's token returns `403`.

- [ ] **Step 8: Report results**

Summarize pass/fail for Steps 2-7 back to the user. If any step failed, do not consider this plan complete — file the failure against the specific task/file responsible and fix it before Phase 4 is considered fully done.
