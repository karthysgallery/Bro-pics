# Phase 6, Plan A — Review Submission & Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing write path for reviews — customer submission, staff moderation, and the `Product.ratingAverage`/`ratingCount` sync — that has never existed despite `ReviewSchema` and read-only display components dating back to Foundation.

**Architecture:** One new lib function (`findVerifiedPurchase`), two new API routes on the customer side is one (`POST /api/reviews`) and two on the staff side (`GET /api/staff/reviews`, `POST /api/staff/reviews/[id]/moderate`), one new Cloud Function Firestore trigger (`onReviewWritten`, mirroring the existing `onVariantWritten` denormalization pattern), one new staff page (`/staff/reviews`), and one new client component (`ReviewForm`) mounted inside the existing `ReviewsSection`.

**Tech Stack:** Next.js App Router (`apps/web`), Firebase Admin SDK + Cloud Functions v2 (`functions`), Firestore, Vitest + Testing Library.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it.
- Follow this codebase's existing patterns exactly: relative imports, the fake-Firestore-query test style in `apps/web/lib/order-lookup.test.ts`, the route-test mocking style in `apps/web/app/api/staff/orders/route.test.ts`, the pure-function-plus-thin-trigger split in `functions/src/products/denormalize.ts`/`.test.ts`.
- `firestore.rules` already has `match /reviews/{id} { allow read: if resource.data.status == 'approved' || isStaffOrAdmin(); allow write: if false; }` — do not touch this file. All writes go through Admin SDK routes, which bypass rules by design.
- `POST /api/reviews` uses `getUserIdFromAuthHeader` (any signed-in user). Both staff routes use `getStaffUserIdFromAuthHeader` (staff-or-admin, not admin-only — matches `/api/staff/orders`' sensitivity).
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `findVerifiedPurchase` lib function

**Files:**
- Modify: `apps/web/lib/order-lookup.ts`
- Modify: `apps/web/lib/order-lookup.test.ts`

**Interfaces:**
- Produces: `findVerifiedPurchase(db: Firestore, userId: string, productId: string): Promise<{ orderId: string } | null>` — consumed by Task 2's route.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/order-lookup.test.ts`:

```ts
function makeFakeVerifiedPurchaseDb(
  orders: Array<{ id: string; data: Record<string, unknown> }>,
  itemsByOrderId: Record<string, Array<{ id: string; data: Record<string, unknown> }>>
) {
  const ordersWhere = vi.fn(() => ({
    get: vi.fn().mockResolvedValue({
      docs: orders.map((o) => ({ id: o.id, data: () => o.data })),
    }),
  }));
  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'orders') {
        return { where: ordersWhere };
      }
      throw new Error(`unexpected top-level collection: ${name}`);
    }),
    doc: vi.fn(),
  };
  // orders/{orderId}/items is reached via db.collection('orders').doc(id).collection('items')
  const docFn = vi.fn((orderId: string) => ({
    collection: vi.fn((name: string) => {
      if (name !== 'items') throw new Error(`unexpected subcollection: ${name}`);
      return {
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              empty: (itemsByOrderId[orderId] ?? []).length === 0,
              docs: (itemsByOrderId[orderId] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
            }),
          })),
        })),
      };
    }),
  }));
  ordersWhere.mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ docs: orders.map((o) => ({ id: o.id, data: () => o.data })) }),
  }));
  (db.collection as unknown as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === 'orders') return { where: ordersWhere, doc: docFn };
    throw new Error(`unexpected top-level collection: ${name}`);
  });
  return db;
}

describe('findVerifiedPurchase', () => {
  it('returns the orderId when an order for that user contains the product', async () => {
    const db = makeFakeVerifiedPurchaseDb(
      [{ id: 'order_1', data: { userId: 'user_1' } }],
      { order_1: [{ id: 'item_1', data: { productId: 'prod_1' } }] }
    );
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toEqual({ orderId: 'order_1' });
  });

  it('returns null when the user has an order but not for that product', async () => {
    const db = makeFakeVerifiedPurchaseDb(
      [{ id: 'order_1', data: { userId: 'user_1' } }],
      { order_1: [{ id: 'item_1', data: { productId: 'some_other_product' } }] }
    );
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toBeNull();
  });

  it('returns null when the user has no orders at all', async () => {
    const db = makeFakeVerifiedPurchaseDb([], {});
    const result = await findVerifiedPurchase(db as never, 'user_1', 'prod_1');
    expect(result).toBeNull();
  });
});
```

Update the file's import line:

```ts
import { findOrderByOrderNo, findOrdersByStatus, findVerifiedPurchase } from './order-lookup';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- order-lookup.test.ts`
Expected: FAIL — `findVerifiedPurchase` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/lib/order-lookup.ts`:

```ts
/**
 * True if userId has placed any order containing productId — checked
 * across every one of their orders (a customer with several orders for
 * the same product only needs one match). Re-implements the same
 * ownership shape firestore.rules already enforces for client reads
 * (orders/{orderId} by userId, its items subcollection by the parent's
 * userId), since the Admin SDK bypasses rules entirely.
 */
export async function findVerifiedPurchase(
  db: Firestore,
  userId: string,
  productId: string
): Promise<{ orderId: string } | null> {
  const ordersSnapshot = await db.collection('orders').where('userId', '==', userId).get();
  for (const orderDoc of ordersSnapshot.docs) {
    const itemsSnapshot = await db
      .collection('orders')
      .doc(orderDoc.id)
      .collection('items')
      .where('productId', '==', productId)
      .limit(1)
      .get();
    if (!itemsSnapshot.empty) {
      return { orderId: orderDoc.id };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- order-lookup.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/order-lookup.ts apps/web/lib/order-lookup.test.ts
git commit -m "feat(reviews): add findVerifiedPurchase lib function"
```

---

### Task 2: `POST /api/reviews` (submission route)

**Files:**
- Create: `apps/web/app/api/reviews/route.ts`
- Create: `apps/web/app/api/reviews/route.test.ts`

**Interfaces:**
- Consumes: `getUserIdFromAuthHeader` (existing), `findVerifiedPurchase` (Task 1).
- Produces: `POST /api/reviews` → `200 { id, status: 'pending' }`, or `401`/`400`/`409` — consumed by Task 7's `ReviewForm`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/reviews/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockFindVerifiedPurchase = vi.fn();
vi.mock('../../../lib/order-lookup', () => ({
  findVerifiedPurchase: (...args: unknown[]) => mockFindVerifiedPurchase(...args),
}));

const mockDuplicateGet = vi.fn();
const mockSet = vi.fn();
const mockDocId = 'review_generated_id';
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({ get: mockDuplicateGet })),
        })),
      })),
      doc: vi.fn(() => ({ id: mockDocId, set: mockSet })),
    })),
  }),
}));
vi.mock('../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/reviews', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDuplicateGet.mockResolvedValue({ empty: true });
  });

  it('returns 401 when not signed in', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when a required field is missing', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when rating is out of range', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 6, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the user already reviewed this product', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockDuplicateGet.mockResolvedValueOnce({ empty: false });
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(409);
  });

  it('creates a pending review with isVerified true when a matching order exists', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindVerifiedPurchase.mockResolvedValueOnce({ orderId: 'order_1' });
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 5, title: 'Great', body: 'Loved it' }));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ id: mockDocId, status: 'pending' });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ isVerified: true, orderId: 'order_1', status: 'pending', userId: 'user_1', productId: 'prod_1' })
    );
  });

  it('creates a pending review with isVerified false when no matching order exists', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockFindVerifiedPurchase.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ productId: 'prod_1', rating: 4, title: 'Nice', body: 'Pretty good' }));
    expect(response.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isVerified: false, orderId: undefined }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "api/reviews/route.test.ts"`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/reviews/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { findVerifiedPurchase } from '../../../lib/order-lookup';
import { ReviewSchema } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const productId = typeof body?.productId === 'string' ? body.productId : null;
  const rating = typeof body?.rating === 'number' ? body.rating : null;
  const title = typeof body?.title === 'string' ? body.title : null;
  const reviewBody = typeof body?.body === 'string' ? body.body : null;

  if (!productId || rating === null || !title || !reviewBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  const existingSnapshot = await db
    .collection('reviews')
    .where('userId', '==', userId)
    .where('productId', '==', productId)
    .limit(1)
    .get();
  if (!existingSnapshot.empty) {
    return NextResponse.json({ error: 'You have already reviewed this product' }, { status: 409 });
  }

  const verifiedPurchase = await findVerifiedPurchase(db, userId, productId);

  const reviewRef = db.collection('reviews').doc();
  const review = ReviewSchema.parse({
    id: reviewRef.id,
    productId,
    userId,
    orderId: verifiedPurchase?.orderId,
    rating,
    title,
    body: reviewBody,
    media: [],
    isVerified: verifiedPurchase !== null,
    status: 'pending',
    createdAt: new Date(),
  });

  await reviewRef.set(review);

  return NextResponse.json({ id: reviewRef.id, status: 'pending' }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "api/reviews/route.test.ts"`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/reviews/route.ts apps/web/app/api/reviews/route.test.ts
git commit -m "feat(reviews): add POST /api/reviews submission route"
```

---

### Task 3: `POST /api/staff/reviews/[id]/moderate` route

**Files:**
- Create: `apps/web/app/api/staff/reviews/[id]/moderate/route.ts`
- Create: `apps/web/app/api/staff/reviews/[id]/moderate/route.test.ts`

**Interfaces:**
- Consumes: `getStaffUserIdFromAuthHeader` (existing).
- Produces: `POST /api/staff/reviews/[id]/moderate` → `200 { id, status }`, or `403`/`400`/`404`/`409` — consumed by Task 6's page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/staff/reviews/[id]/moderate/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })),
    })),
  }),
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/staff/reviews/review_1/moderate', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id = 'review_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/staff/reviews/[id]/moderate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(403);
  });

  it('returns 400 on an invalid action', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await POST(makeRequest({ action: 'delete' }), makeContext());
    expect(response.status).toBe(400);
  });

  it('returns 404 when the review does not exist', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: false });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(404);
  });

  it('returns 409 when the review is not pending', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'approved' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(409);
  });

  it('approves a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'approve' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'approved' });
  });

  it('rejects a pending review', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });
    const response = await POST(makeRequest({ action: 'reject' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'rejected' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/reviews/\[id\]/moderate/route.test.ts"`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/staff/reviews/[id]/moderate/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const body = await request.json();
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const { id } = await context.params;
  const db = getFirestore(getAdminApp());
  const reviewRef = db.collection('reviews').doc(id);
  const reviewDoc = await reviewRef.get();
  if (!reviewDoc.exists) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }
  const current = reviewDoc.data() as { status: string };
  if (current.status !== 'pending') {
    return NextResponse.json({ error: 'Review is not pending' }, { status: 409 });
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  await reviewRef.update({ status: nextStatus });

  return NextResponse.json({ id, status: nextStatus }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/reviews/\[id\]/moderate/route.test.ts"`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/staff/reviews/\[id\]/moderate/route.ts apps/web/app/api/staff/reviews/\[id\]/moderate/route.test.ts
git commit -m "feat(reviews): add staff review-moderation route"
```

---

### Task 4: `onReviewWritten` Cloud Function trigger (rating denormalization)

**Files:**
- Create: `functions/src/products/denormalize-ratings.ts`
- Create: `functions/src/products/denormalize-ratings.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces: `calculateRatingFields(ratings: number[]): { ratingAverage: number; ratingCount: number }` (unit-tested directly), `onReviewWritten` (thin trigger, not unit-tested directly — matches `onVariantWritten`'s own docblock reasoning).

- [ ] **Step 1: Write the failing test**

Create `functions/src/products/denormalize-ratings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateRatingFields } from './denormalize-ratings';

describe('calculateRatingFields', () => {
  it('returns zeroed fields for an empty rating list', () => {
    expect(calculateRatingFields([])).toEqual({ ratingAverage: 0, ratingCount: 0 });
  });

  it('computes the average and count for a mixed set of ratings', () => {
    expect(calculateRatingFields([5, 4, 3])).toEqual({ ratingAverage: 4, ratingCount: 3 });
  });

  it('rounds the average to one decimal place', () => {
    expect(calculateRatingFields([5, 5, 4])).toEqual({ ratingAverage: 4.7, ratingCount: 3 });
  });

  it('handles a single rating', () => {
    expect(calculateRatingFields([3])).toEqual({ ratingAverage: 3, ratingCount: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test -- denormalize-ratings.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `functions/src/products/denormalize-ratings.ts`:

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface RatingFields {
  ratingAverage: number;
  ratingCount: number;
}

export function calculateRatingFields(ratings: number[]): RatingFields {
  if (ratings.length === 0) {
    return { ratingAverage: 0, ratingCount: 0 };
  }
  const sum = ratings.reduce((total, r) => total + r, 0);
  const average = Math.round((sum / ratings.length) * 10) / 10;
  return { ratingAverage: average, ratingCount: ratings.length };
}

/**
 * Thin Cloud Function glue: on any write to a review doc, re-reads every
 * approved review for that product and writes the recalculated rating
 * fields onto the parent product doc. Fires on every write (submission,
 * approval, rejection) rather than only on approval — a non-approval
 * write is a no-op recompute, but this keeps the trigger's logic uniform:
 * always derive the aggregate fresh from the approved set, never patch
 * counts incrementally. Not unit-tested directly, same reasoning as
 * onVariantWritten's docblock — a few lines of Admin SDK read/write
 * around the pure, fully-tested calculateRatingFields above.
 */
export const onReviewWritten = onDocumentWritten('reviews/{reviewId}', async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  const productId = (after?.productId ?? before?.productId) as string | undefined;
  if (!productId) return;

  const db = getFirestore();
  const approvedSnapshot = await db
    .collection('reviews')
    .where('productId', '==', productId)
    .where('status', '==', 'approved')
    .get();
  const ratings = approvedSnapshot.docs.map((doc) => (doc.data() as { rating: number }).rating);

  const fields = calculateRatingFields(ratings);
  await db.collection('products').doc(productId).set(fields, { merge: true });
});
```

Add the export to `functions/src/index.ts`, alongside the other product-trigger exports:

```ts
export { onReviewWritten } from './products/denormalize-ratings';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test -- denormalize-ratings.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/src/products/denormalize-ratings.ts functions/src/products/denormalize-ratings.test.ts functions/src/index.ts
git commit -m "feat(reviews): add onReviewWritten trigger to keep product ratings in sync"
```

---

### Task 5: `GET /api/staff/reviews?status=pending` route

**Files:**
- Create: `apps/web/app/api/staff/reviews/route.ts`
- Create: `apps/web/app/api/staff/reviews/route.test.ts`

**Interfaces:**
- Consumes: `getStaffUserIdFromAuthHeader` (existing).
- Produces: `GET /api/staff/reviews?status=<ReviewStatus>` → `200 { reviews: Array<{id, productId, productTitle, userId, rating, title, body, isVerified, status, createdAt}> }`, or `403`/`400` — consumed by Task 6's page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/staff/reviews/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetStaffUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getStaffUserIdFromAuthHeader: (...args: unknown[]) => mockGetStaffUserId(...args),
}));

const mockReviewsGet = vi.fn();
const mockProductGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'reviews') {
        return { where: vi.fn(() => ({ get: mockReviewsGet })) };
      }
      if (name === 'products') {
        return { doc: vi.fn(() => ({ get: mockProductGet })) };
      }
      throw new Error(`unexpected collection: ${name}`);
    }),
  }),
}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/staff/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not staff/admin', async () => {
    mockGetStaffUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when status is missing or invalid', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=not_a_status'));
    expect(response.status).toBe(400);
  });

  it('returns matching reviews with productTitle populated from a batch product lookup', async () => {
    mockGetStaffUserId.mockResolvedValueOnce('staff_1');
    mockReviewsGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'review_1',
          data: () => ({
            productId: 'prod_1',
            userId: 'user_1',
            rating: 5,
            title: 'Great',
            body: 'Loved it',
            isVerified: true,
            status: 'pending',
            createdAt: '2026-09-09T00:00:00.000Z',
          }),
        },
      ],
    });
    mockProductGet.mockResolvedValueOnce({ exists: true, data: () => ({ title: 'Classic Wooden Photo Frame' }) });

    const response = await GET(makeRequest('https://example.com/api/staff/reviews?status=pending'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reviews).toEqual([
      expect.objectContaining({ id: 'review_1', productId: 'prod_1', productTitle: 'Classic Wooden Photo Frame' }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/reviews/route.test.ts"`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/staff/reviews/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { ReviewStatusSchema } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = ReviewStatusSchema.safeParse(url.searchParams.get('status'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('status', '==', parsed.data).get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

  const distinctProductIds = [...new Set(rows.map((r) => r.productId as string))];
  const productEntries = await Promise.all(
    distinctProductIds.map(async (productId) => {
      const productDoc = await db.collection('products').doc(productId).get();
      return [productId, productDoc.exists ? (productDoc.data() as { title: string }).title : 'Unknown product'] as const;
    })
  );
  const titleByProductId = new Map(productEntries);

  const reviews = rows.map((r) => ({ ...r, productTitle: titleByProductId.get(r.productId as string) }));

  return NextResponse.json({ reviews }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "api/staff/reviews/route.test.ts"`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/staff/reviews/route.ts apps/web/app/api/staff/reviews/route.test.ts
git commit -m "feat(reviews): add GET /api/staff/reviews moderation-queue route"
```

---

### Task 6: `/staff/reviews` moderation page

**Files:**
- Create: `apps/web/app/staff/reviews/page.tsx`
- Create: `apps/web/app/staff/reviews/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/staff/reviews?status=pending` (Task 5), `POST /api/staff/reviews/[id]/moderate` (Task 3).

Apply the `loading`-flag 3-part auth-flash fix from the start (destructure `loading` from `useAuth()`, gate the authorization effect on it, include it in the dependency array) — this codebase has hit and fixed the same bug on `/admin/roles` and `/staff/orders` twice already; do not reintroduce it on a third page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/staff/reviews/page.test.tsx`, mirroring `apps/web/app/admin/roles/page.test.tsx`'s mocking style (mock `useAuth`, mock `global.fetch`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StaffReviewsPage from './page';
import { useAuth } from '../../../lib/auth-context';

vi.mock('../../../lib/auth-context', () => ({ useAuth: vi.fn() }));

const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
const mockGetIdTokenResult = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function mockSignedInAsStaff() {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'staff_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
    loading: false,
  } as unknown as ReturnType<typeof useAuth>);
  mockGetIdTokenResult.mockResolvedValue({ claims: { role: 'staff' } });
}

describe('StaffReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not flash "Not authorized" while the auth check is still loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as unknown as ReturnType<typeof useAuth>);
    render(<StaffReviewsPage />);
    expect(screen.queryByText(/not authorized/i)).not.toBeInTheDocument();
  });

  it('shows "Not authorized" for a signed-out visitor once loading resolves', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as unknown as ReturnType<typeof useAuth>);
    render(<StaffReviewsPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('loads the pending queue and removes a row after approving it', async () => {
    mockSignedInAsStaff();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            reviews: [
              { id: 'review_1', productId: 'prod_1', productTitle: 'Classic Wooden Photo Frame', userId: 'user_1', rating: 5, title: 'Great', body: 'Loved it', isVerified: true, status: 'pending' },
            ],
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'review_1', status: 'approved' }) });

    render(<StaffReviewsPage />);
    expect(await screen.findByText('Classic Wooden Photo Frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith('/api/staff/reviews/review_1/moderate', expect.objectContaining({ method: 'POST' }))
    );
    await waitFor(() => expect(screen.queryByText('Classic Wooden Photo Frame')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "staff/reviews/page.test.tsx"`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/staff/reviews/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';

interface PendingReview {
  id: string;
  productId: string;
  productTitle: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  status: string;
}

export default function StaffReviewsPage() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reviews, setReviews] = useState<PendingReview[]>([]);

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

  useEffect(() => {
    if (authorized !== true) return;
    (async () => {
      const idToken = await user!.getIdToken();
      const response = await fetch('/api/staff/reviews?status=pending', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setReviews(body.reviews ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const moderate = async (id: string, action: 'approve' | 'reject') => {
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/reviews/${id}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return;
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Pending Reviews</h1>
      {reviews.length === 0 && <p className="text-sm text-charcoal/70">Nothing pending.</p>}
      <ul className="flex flex-col gap-4">
        {reviews.map((review) => (
          <li key={review.id} className="border-b border-charcoal/10 pb-4">
            <p className="font-medium text-sm">{review.productTitle}</p>
            <p className="text-xs text-sage mb-1">{'★'.repeat(review.rating)}{review.isVerified && ' · Verified purchase'}</p>
            <p className="text-sm font-medium">{review.title}</p>
            <p className="text-sm text-charcoal/80 mb-2">{review.body}</p>
            <div className="flex gap-2">
              <button onClick={() => moderate(review.id, 'approve')} className="rounded bg-charcoal text-cream px-3 py-1 text-sm">
                Approve
              </button>
              <button onClick={() => moderate(review.id, 'reject')} className="rounded border border-charcoal/30 px-3 py-1 text-sm">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "staff/reviews/page.test.tsx"`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/staff/reviews/page.tsx apps/web/app/staff/reviews/page.test.tsx
git commit -m "feat(reviews): add staff review-moderation queue page"
```

---

### Task 7: `ReviewForm` client component, wired into `ReviewsSection`

**Files:**
- Create: `apps/web/components/product/ReviewForm.tsx`
- Create: `apps/web/components/product/ReviewForm.test.tsx`
- Modify: `apps/web/components/product/ReviewsSection.tsx`
- Modify: `apps/web/components/product/ReviewsSection.test.tsx` (if it exists — check first; if not, skip this file)

**Interfaces:**
- Consumes: `POST /api/reviews` (Task 2), `useAuth` (existing).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/product/ReviewForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from './ReviewForm';
import { useAuth } from '../../lib/auth-context';

vi.mock('../../lib/auth-context', () => ({ useAuth: vi.fn() }));

const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('ReviewForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a sign-in prompt when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as unknown as ReturnType<typeof useAuth>);
    render(<ReviewForm productId="prod_1" />);
    expect(screen.getByText(/sign in to write a review/i)).toBeInTheDocument();
  });

  it('submits a review and shows the pending-confirmation message', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user_1', getIdToken: mockGetIdToken },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'review_1', status: 'pending' }) });

    render(<ReviewForm productId="prod_1" />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Great frame' } });
    fireEvent.change(screen.getByLabelText(/your review/i), { target: { value: 'Really happy with it' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument());
  });

  it('shows the duplicate message on a 409 response', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user_1', getIdToken: mockGetIdToken },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({ error: 'already reviewed' }) });

    render(<ReviewForm productId="prod_1" />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Great frame' } });
    fireEvent.change(screen.getByLabelText(/your review/i), { target: { value: 'Really happy with it' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/already reviewed/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- ReviewForm.test.tsx`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/components/product/ReviewForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';

export function ReviewForm({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <p className="text-sm text-charcoal/70">Sign in to write a review.</p>;
  }

  if (submitted) {
    return <p className="text-sm text-sage">Thanks — your review is awaiting approval.</p>;
  }

  const handleSubmit = async () => {
    setError(null);
    const idToken = await user.getIdToken();
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ productId, rating, title, body }),
    });
    if (response.status === 409) {
      setError("You've already reviewed this product.");
      return;
    }
    if (!response.ok) {
      setError('Could not submit your review.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col gap-2 mt-6 max-w-sm">
      <label htmlFor="review-rating">Rating</label>
      <select
        id="review-rating"
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {n} star{n > 1 ? 's' : ''}
          </option>
        ))}
      </select>

      <label htmlFor="review-title">Title</label>
      <input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="review-body">Your review</label>
      <textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button onClick={handleSubmit} disabled={!title || !body} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Submit
      </button>
    </div>
  );
}
```

Modify `apps/web/components/product/ReviewsSection.tsx` — add the import and render `ReviewForm` at the end of the section, always (not just in the empty-state branch, since a signed-in user should be able to review a product that already has other reviews too):

```ts
import { ReviewForm } from './ReviewForm';
```

Add `<ReviewForm productId={product.id} />` right after the closing `</>` / before the section's final content, i.e. as the last child inside `<section id="reviews" ...>`, after both the `reviews.length === 0` and the populated branches.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- ReviewForm.test.tsx`
Expected: PASS (all 3 tests)

Also run the existing `ReviewsSection` test file, if one exists, to confirm the new `ReviewForm` mount doesn't break its existing assertions (it will need `useAuth` mocked now, since `ReviewForm` calls it unconditionally):

Run: `pnpm --filter @bro-pics/web test -- ReviewsSection.test.tsx`
Expected: PASS, after adding a `vi.mock('../../lib/auth-context', ...)` returning a signed-out user to that file if it doesn't already mock it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/product/ReviewForm.tsx apps/web/components/product/ReviewForm.test.tsx apps/web/components/product/ReviewsSection.tsx
git add apps/web/components/product/ReviewsSection.test.tsx 2>/dev/null || true
git commit -m "feat(reviews): add customer review submission form"
```

---

### Task 8: Full verification and `PROJECT_STATUS.md` update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including all new/modified files above.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a `6a` row to the §3 roadmap table for "Phase 6 Plan A — Review submission & moderation", complete, on `feature/admin-panel-and-production-queue`, linking the design and plan docs (match the existing rows' exact format). Update §4's test count. Add a new §5 gap bullet: the `onReviewWritten` Cloud Function trigger and the full submit→moderate→rating-sync flow have never run against the live project (same category as the existing "never run live" bullets for Razorpay/staff-orders) — needs a real signed-in customer account and a real staff/admin account, both already-known live-verification gaps this plan doesn't newly introduce. Note explicitly that no live third-party integration was skipped in this plan (unlike the analytics/SEO-domain items still pending for later Phase 6 plans) — everything here runs on infrastructure already live (Firestore, existing auth).

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 6 Plan A completion in PROJECT_STATUS.md"
```
