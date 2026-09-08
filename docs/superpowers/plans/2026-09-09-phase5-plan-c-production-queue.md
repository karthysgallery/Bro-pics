# Phase 5, Plan C — Production/Fulfillment Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff see every order sitting in a given status (a real queue), not just look up one order at a time by number.

**Architecture:** One new lib function (`findOrdersByStatus`, alongside the existing `findOrderByOrderNo`), one new collection-level route (`GET /api/staff/orders`), one new Firestore composite index, and an additive UI section on the existing `/staff/orders` page — the existing lookup/advance flow is reused unchanged, just fed a different way.

**Tech Stack:** Next.js App Router (`apps/web`), Firebase Admin SDK, Firestore composite indexes, Vitest + Testing Library.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it.
- Follow this codebase's existing patterns exactly: relative imports, the fake-Firestore-query test style already in `apps/web/lib/order-lookup.test.ts` (not a live emulator), the route-testing conventions in `apps/web/app/api/staff/orders/[orderNo]/route.test.ts`.
- Staff-or-admin gate (`getStaffUserIdFromAuthHeader`) on the new route — NOT admin-only (this is operational work, same sensitivity as the existing lookup/advance routes, unlike Plan B's role management).
- Do not touch `isValidStatusTransition`, the `OrderEvent` write path, or the advance route/form logic — reuse them as-is.
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `findOrdersByStatus` lib function

**Files:**
- Modify: `apps/web/lib/order-lookup.ts`
- Modify: `apps/web/lib/order-lookup.test.ts`

**Interfaces:**
- Produces: `findOrdersByStatus(db: Firestore, status: OrderStatus): Promise<Array<{id: string, data: Order}>>` — consumed by Task 2's route.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/order-lookup.test.ts` (extend the existing `makeFakeDb` helper to also support `.where().orderBy().get()`, and add a new `describe` block):

```ts
function makeFakeQueryDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
          }),
        })),
      })),
    })),
  };
}

describe('findOrdersByStatus', () => {
  it('returns every order matching the given status, in query order', async () => {
    const db = makeFakeQueryDb([
      { id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid', placedAt: '2026-09-01T00:00:00.000Z' } },
      { id: 'order_2', data: { orderNo: 'BP-2026-00002', status: 'paid', placedAt: '2026-09-02T00:00:00.000Z' } },
    ]);
    const result = await findOrdersByStatus(db as never, 'paid');
    expect(result).toEqual([
      { id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'paid', placedAt: '2026-09-01T00:00:00.000Z' } },
      { id: 'order_2', data: { orderNo: 'BP-2026-00002', status: 'paid', placedAt: '2026-09-02T00:00:00.000Z' } },
    ]);
  });

  it('returns an empty array when no orders match', async () => {
    const db = makeFakeQueryDb([]);
    const result = await findOrdersByStatus(db as never, 'delivered');
    expect(result).toEqual([]);
  });
});
```

Update the file's import line to include `findOrdersByStatus`:

```ts
import { findOrderByOrderNo, findOrdersByStatus } from './order-lookup';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- order-lookup.test.ts`
Expected: FAIL — `findOrdersByStatus` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/lib/order-lookup.ts` (update the type import line to add `OrderStatus`, then add the function):

```ts
import type { Order, OrderStatus } from '@bro-pics/shared';
```

```ts
/**
 * Every order currently sitting in a given status, oldest-placed first —
 * a fulfillment queue processes FIFO, the opposite of the customer-facing
 * order-history list's newest-first ordering. Requires a composite index
 * on (status ASC, placedAt ASC) — see firestore.indexes.json.
 */
export async function findOrdersByStatus(
  db: Firestore,
  status: OrderStatus
): Promise<Array<{ id: string; data: Order }>> {
  const snapshot = await db.collection('orders').where('status', '==', status).orderBy('placedAt', 'asc').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Order }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- order-lookup.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/order-lookup.ts apps/web/lib/order-lookup.test.ts
git commit -m "feat(staff): add findOrdersByStatus lib function"
```

---

### Task 2: `GET /api/staff/orders?status=<OrderStatus>` route

**Files:**
- Create: `apps/web/app/api/staff/orders/route.ts`
- Create: `apps/web/app/api/staff/orders/route.test.ts`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `findOrdersByStatus` (Task 1), `getStaffUserIdFromAuthHeader` (existing).
- Produces: `GET /api/staff/orders?status=<OrderStatus>` → `200` with `{orders: Array<{id, orderNo, status, total, placedAt, addressJson}>}`, or `403`/`400` — consumed by Task 3's page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/staff/orders/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockFindOrdersByStatus = vi.fn();
vi.mock('../../../../lib/order-lookup', () => ({
  findOrdersByStatus: (...args: unknown[]) => mockFindOrdersByStatus(...args),
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=paid'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when status is missing', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await GET(makeRequest('https://example.com/api/staff/orders'));
    expect(response.status).toBe(400);
  });

  it('returns 400 when status is not a valid OrderStatus', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns the matching orders on a valid status', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockFindOrdersByStatus.mockResolvedValueOnce([
      {
        id: 'order_1',
        data: {
          orderNo: 'BP-2026-00001',
          status: 'paid',
          total: 150000,
          placedAt: '2026-09-01T00:00:00.000Z',
          addressJson: { city: 'Chennai' },
        },
      },
    ]);
    const response = await GET(makeRequest('https://example.com/api/staff/orders?status=paid'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toEqual([
      { id: 'order_1', orderNo: 'BP-2026-00001', status: 'paid', total: 150000, placedAt: '2026-09-01T00:00:00.000Z', addressJson: { city: 'Chennai' } },
    ]);
    expect(mockFindOrdersByStatus).toHaveBeenCalledWith(expect.anything(), 'paid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/orders/route.test.ts"`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/staff/orders/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { findOrdersByStatus } from '../../../../lib/order-lookup';
import { OrderStatusSchema } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const parsed = OrderStatusSchema.safeParse(statusParam);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const found = await findOrdersByStatus(db, parsed.data);
  const orders = found.map(({ id, data }) => ({
    id,
    orderNo: data.orderNo,
    status: data.status,
    total: data.total,
    placedAt: data.placedAt,
    addressJson: data.addressJson,
  }));

  return NextResponse.json({ orders }, { status: 200 });
}
```

Add a new entry to `firestore.indexes.json`'s top-level `indexes` array (alongside the existing `orders` entry for `userId`/`placedAt`):

```json
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "placedAt", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/orders/route.test.ts"`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/staff/orders/route.ts apps/web/app/api/staff/orders/route.test.ts firestore.indexes.json
git commit -m "feat(staff): add order-queue route and its Firestore index"
```

---

### Task 3: Queue view on `/staff/orders`, plus the documented auth-flash fix

**Files:**
- Modify: `apps/web/app/staff/orders/page.tsx`
- Modify: `apps/web/app/staff/orders/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/staff/orders?status=...` (Task 2), the existing `GET /api/staff/orders/[orderNo]` (unchanged).

This task also closes a documented, pre-existing gap on this exact page: PROJECT_STATUS.md records that `/staff/orders` briefly flashes "Not authorized" to a legitimate staff/admin user on every hard page load, because the authorization `useEffect` doesn't gate on `useAuth()`'s `loading` flag — and prescribes the fix (destructure `loading`, gate the effect on it, add it to the dependency array). Since this task is already modifying this file, fix it here too, the same way it was fixed on `/admin/roles` in Phase 5 Plan B.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/app/staff/orders/page.test.tsx` (the file already mocks `useAuth` via `vi.mock('../../../lib/auth-context', ...)` with `mockDefaultAuthImpl` returning `loading: false`) — add these two new tests, and update the top-of-file mock helper to allow a `loading: true` variant:

```tsx
  it('does not flash "Not authorized" while the auth check is still loading', () => {
    vi.mocked(useAuth).mockImplementation(
      () => ({ user: { uid: 'staff_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult }, loading: true }) as unknown as ReturnType<typeof useAuth>
    );
    render(<StaffOrdersPage />);
    expect(screen.queryByText(/not authorized/i)).not.toBeInTheDocument();
  });

  it('loads the queue for the default status filter and populates the advance form on a row click', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'staff' } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            orders: [{ id: 'order_1', orderNo: 'BP-2026-00001', status: 'paid', total: 150000, placedAt: '2026-09-01T00:00:00.000Z', addressJson: { city: 'Chennai' } }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ order: { orderNo: 'BP-2026-00001', status: 'paid' }, items: [{ title: 'Frame', qty: 1 }] }),
      });

    render(<StaffOrdersPage />);
    expect(await screen.findByText('BP-2026-00001')).toBeInTheDocument();

    fireEvent.click(screen.getByText('BP-2026-00001'));

    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/staff/orders/BP-2026-00001', expect.anything()));
    expect(await screen.findByText('Frame')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "staff/orders/page.test.tsx"`
Expected: FAIL — no queue section exists yet, and the auth-flash test fails since `loading` isn't gated on.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/app/staff/orders/page.tsx` with:

```tsx
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

interface QueueRow {
  id: string;
  orderNo: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  addressJson: { city?: string } | null;
}

export default function StaffOrdersPage() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus>('paid');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [orderNoInput, setOrderNoInput] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => {
        const role = result.claims.role;
        setAuthorized(role === 'admin' || role === 'staff');
      })
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading]);

  const loadOrder = async (orderNo: string) => {
    setError(null);
    setOrder(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/orders/${orderNo}`, {
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

  useEffect(() => {
    if (authorized !== true) return;
    (async () => {
      const idToken = await user!.getIdToken();
      const response = await fetch(`/api/staff/orders?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setQueue(body.orders ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, statusFilter]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    await loadOrder(orderNoInput);
  };

  const handleQueueRowClick = async (orderNo: string) => {
    setOrderNoInput(orderNo);
    await loadOrder(orderNo);
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
      <h1 className="font-display text-2xl">Order Queue</h1>

      <label htmlFor="status-filter">Status</label>
      <select
        id="status-filter"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as OrderStatus)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <ul className="flex flex-col gap-1">
        {queue.map((row) => (
          <li key={row.id}>
            <button onClick={() => handleQueueRowClick(row.orderNo)} className="text-left underline">
              {row.orderNo}
            </button>
            {' — '}
            {row.addressJson?.city ?? ''}
          </li>
        ))}
      </ul>

      <h2 className="font-display text-xl pt-4 border-t border-charcoal/10">Order Lookup</h2>

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

The existing two tests in `page.test.tsx` (`'looks up an order and shows a status-advance form for a staff user'` and `'shows courier/AWB fields only when the selected next status is shipped, and submits the advance'`) will now see one extra `fetch` call each (the new queue-load effect firing on mount once `authorized` becomes `true`) — update those two tests' `mockFetch` chains to prepend one extra `mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orders: [] }) })` before their existing mocked responses, so the queue load resolves harmlessly before the test's own lookup/advance sequence proceeds.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "staff/orders/page.test.tsx"`
Expected: PASS (all 6 tests: the original 4, updated for the extra queue-load fetch call, plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/staff/orders/page.tsx apps/web/app/staff/orders/page.test.tsx
git commit -m "feat(staff): add production queue view, fix documented auth-flash on this page"
```

---

### Task 4: Deploy the index, full verification, and PROJECT_STATUS.md update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Deploy the new Firestore index**

Run: `firebase deploy --only firestore:indexes`
Expected: succeeds. This project has hit this exact gap before (a correctly-declared index that was never deployed) — don't skip this step. Confirm via `firebase firestore:indexes` that the new `status`/`placedAt` composite entry for `orders` now appears in the live project's index list. Note in the report whether it shows as ready or still building (it can take real time — this project has also hit that before).

- [ ] **Step 2: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including the new/modified files above.

- [ ] **Step 3: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean across the five workspaces that have a `typecheck` script.

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

Add a `4f` row to the §3 roadmap table for "Phase 5 Plan C — Production/fulfillment queue", complete, on `feature/admin-panel-and-production-queue`, linking the design and plan docs (match the `4a`-`4e` rows' exact format). Update §4's test count. Remove or amend the "Plan C's staff order-tracking flow has never run live" bullet in §5 if it's now superseded (the underlying live-verification gap — no staff/admin account exists yet on the live project — is unchanged and still blocks fully exercising this live; note that clearly, don't overstate). Note in §5 whether the new Firestore index was confirmed ready or still building at the time of this commit.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 5 Plan C completion in PROJECT_STATUS.md"
```
