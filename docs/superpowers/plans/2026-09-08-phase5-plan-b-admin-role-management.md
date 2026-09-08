# Phase 5, Plan B — Admin Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a UI to grant/revoke the `admin`/`staff` custom claim by phone-number lookup, replacing the manual `set-user-role.ts` script for ongoing (post-bootstrap) role management.

**Architecture:** One new admin-only auth helper, two thin Admin-SDK routes (lookup by phone, set role), one client-gated page. No new schema, no new Firestore collection — this plan works entirely through Firebase Auth custom claims, the same mechanism Plan C already relies on.

**Tech Stack:** Next.js App Router (`apps/web`), Firebase Admin SDK (`firebase-admin/auth`), Vitest + Testing Library.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it.
- Follow this codebase's existing patterns exactly: relative imports, `'use client'` at the top of client components, the exact test-mocking conventions already used in `apps/web/lib/verify-id-token.test.ts` and `apps/web/app/staff/orders/page.test.tsx` (reuse them, don't invent new ones).
- Admin-only means `role === 'admin'` exactly — never accept `'staff'` for these routes/page.
- Do not touch `scripts/seed/src/set-user-role.ts` — it stays as the bootstrap tool, unmodified.
- Do not touch `/staff/orders` or its routes — Plan C's territory.
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `getAdminUserIdFromAuthHeader`

**Files:**
- Modify: `apps/web/lib/verify-id-token.ts`
- Modify: `apps/web/lib/verify-id-token.test.ts`

**Interfaces:**
- Produces: `getAdminUserIdFromAuthHeader(request: Request): Promise<string | null>` — consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/verify-id-token.test.ts`, a new `describe` block after the existing `getStaffUserIdFromAuthHeader` block:

```ts
describe('getAdminUserIdFromAuthHeader', () => {
  it('returns null when there is no Authorization header', async () => {
    const request = new Request('https://example.com', { headers: {} });
    expect(await getAdminUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns the uid when the token verifies and role is admin', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'admin_1', role: 'admin' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getAdminUserIdFromAuthHeader(request)).toBe('admin_1');
  });

  it('returns null when the token verifies but role is staff (not admin)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'staff_1', role: 'staff' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getAdminUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns null when the token verifies but has no role claim', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'customer_1' });
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer good-token' } });
    expect(await getAdminUserIdFromAuthHeader(request)).toBeNull();
  });

  it('returns null when verifyIdToken rejects', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com', { headers: { Authorization: 'Bearer bad-token' } });
    expect(await getAdminUserIdFromAuthHeader(request)).toBeNull();
  });
});
```

Update the file's import line to include the new function:

```ts
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader, getAdminUserIdFromAuthHeader } from './verify-id-token';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token.test.ts`
Expected: FAIL — `getAdminUserIdFromAuthHeader` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/lib/verify-id-token.ts` (after the existing `getStaffUserIdFromAuthHeader` function):

```ts
/**
 * Like getStaffUserIdFromAuthHeader, but requires the 'admin' role
 * specifically — 'staff' does not pass. Used for role-management routes,
 * which are more sensitive than order lookup/advance.
 */
export async function getAdminUserIdFromAuthHeader(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    const role = (decoded as { role?: string }).role;
    if (role !== 'admin') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- verify-id-token.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/verify-id-token.ts apps/web/lib/verify-id-token.test.ts
git commit -m "feat(admin): add getAdminUserIdFromAuthHeader"
```

---

### Task 2: Lookup and role-assignment routes

**Files:**
- Create: `apps/web/app/api/admin/users/lookup/route.ts`
- Create: `apps/web/app/api/admin/users/lookup/route.test.ts`
- Create: `apps/web/app/api/admin/users/[uid]/role/route.ts`
- Create: `apps/web/app/api/admin/users/[uid]/role/route.test.ts`

**Interfaces:**
- Consumes: `getAdminUserIdFromAuthHeader` (Task 1).
- Produces: `GET /api/admin/users/lookup?phone=<E.164>` → `{uid, phoneNumber, role: string | null}` (200) or 403/404. `POST /api/admin/users/[uid]/role` with body `{role: 'admin' | 'staff' | null}` → `{uid, role}` (200) or 403/400. Both consumed by Task 3's page.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/admin/users/lookup/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../lib/verify-id-token', () => ({
  getAdminUserIdFromAuthHeader: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockGetUserByPhoneNumber = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ getUserByPhoneNumber: mockGetUserByPhoneNumber })),
}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(url: string, authHeader = 'Bearer good-token'): Request {
  return new Request(url, { headers: { Authorization: authHeader } });
}

describe('GET /api/admin/users/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce(null);
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(403);
  });

  it('returns 400 when phone is missing', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup'));
    expect(response.status).toBe(400);
  });

  it('returns 404 when no account has that phone number', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockRejectedValueOnce(new Error('no user'));
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(404);
  });

  it('returns the account with its current role on a match', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'user_9',
      phoneNumber: '+911234567890',
      customClaims: { role: 'staff' },
    });
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', phoneNumber: '+911234567890', role: 'staff' });
  });

  it('returns role: null when the account has no role claim yet', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    mockGetUserByPhoneNumber.mockResolvedValueOnce({
      uid: 'user_9',
      phoneNumber: '+911234567890',
      customClaims: undefined,
    });
    const response = await GET(makeRequest('https://example.com/api/admin/users/lookup?phone=%2B911234567890'));
    const body = await response.json();
    expect(body.role).toBeNull();
  });
});
```

Create `apps/web/app/api/admin/users/[uid]/role/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetAdminUserId = vi.fn();
vi.mock('../../../../../../lib/verify-id-token', () => ({
  getAdminUserIdFromAuthHeader: (...args: unknown[]) => mockGetAdminUserId(...args),
}));

const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/users/user_9/role', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(uid: string) {
  return { params: Promise.resolve({ uid }) };
}

describe('POST /api/admin/users/[uid]/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockGetAdminUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(403);
  });

  it('returns 400 for an invalid role value', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'superadmin' }), makeParams('user_9'));
    expect(response.status).toBe(400);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('sets the role claim on the target account', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: 'staff' }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', { role: 'staff' });
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: 'staff' });
  });

  it('clears the role claim when role is null', async () => {
    mockGetAdminUserId.mockResolvedValueOnce('admin_1');
    const response = await POST(makeRequest({ role: null }), makeParams('user_9'));
    expect(response.status).toBe(200);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user_9', {});
    const body = await response.json();
    expect(body).toEqual({ uid: 'user_9', role: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test -- "api/admin/users"`
Expected: FAIL — neither route file exists yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/api/admin/users/lookup/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getAdminUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';

export async function GET(request: Request): Promise<NextResponse> {
  const adminUserId = await getAdminUserIdFromAuthHeader(request);
  if (!adminUserId) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  }

  try {
    const user = await getAuth(getAdminApp()).getUserByPhoneNumber(phone);
    return NextResponse.json(
      { uid: user.uid, phoneNumber: user.phoneNumber, role: (user.customClaims?.role as string | undefined) ?? null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: `No account with phone ${phone}` }, { status: 404 });
  }
}
```

Create `apps/web/app/api/admin/users/[uid]/role/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getAdminUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

const VALID_ROLES = ['admin', 'staff'] as const;

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const adminUserId = await getAdminUserIdFromAuthHeader(request);
  if (!adminUserId) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { uid } = await params;
  const body = await request.json();
  const role = body?.role;
  if (role !== null && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'role must be "admin", "staff", or null' }, { status: 400 });
  }

  await getAuth(getAdminApp()).setCustomUserClaims(uid, role ? { role } : {});

  return NextResponse.json({ uid, role }, { status: 200 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test -- "api/admin/users"`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/users
git commit -m "feat(admin): add role lookup and assignment routes"
```

---

### Task 3: Admin role-management page

**Files:**
- Create: `apps/web/app/admin/roles/page.tsx`
- Create: `apps/web/app/admin/roles/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/users/lookup?phone=...`, `POST /api/admin/users/[uid]/role` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/admin/roles/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminRolesPage from './page';
import { useAuth } from '../../../lib/auth-context';

const mockGetIdTokenResult = vi.fn();
const mockGetIdToken = vi.fn().mockResolvedValue('id-token');
const mockDefaultAuthImpl = () => ({
  user: { uid: 'admin_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
  loading: false,
});
vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => mockDefaultAuthImpl()),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('AdminRolesPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.mocked(useAuth).mockImplementation(() => mockDefaultAuthImpl() as unknown as ReturnType<typeof useAuth>);
  });

  it('shows "Not authorized" when the signed-in user is not an admin', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'staff' } });
    render(<AdminRolesPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('shows "Not authorized" for a signed-out visitor', async () => {
    vi.mocked(useAuth).mockImplementation(() => ({ user: null, loading: false }) as unknown as ReturnType<typeof useAuth>);
    render(<AdminRolesPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('looks up an account by phone and shows its current role', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ uid: 'user_9', phoneNumber: '+911234567890', role: 'staff' }),
    });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+911234567890' } });
    fireEvent.click(screen.getByText('Look up'));

    expect(await screen.findByText('+911234567890')).toBeInTheDocument();
    expect(await screen.findByText(/staff/i)).toBeInTheDocument();
  });

  it('shows "No account with that phone number" on a 404', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+919999999999' } });
    fireEvent.click(screen.getByText('Look up'));

    expect(await screen.findByText(/no account/i)).toBeInTheDocument();
  });

  it('sets a new role and submits the change', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uid: 'user_9', phoneNumber: '+911234567890', role: null }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uid: 'user_9', role: 'admin' }) });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+911234567890' } });
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() => screen.getByLabelText('Role'));

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/users/user_9/role',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
          body: JSON.stringify({ role: 'admin' }),
        })
      )
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- admin/roles/page.test.tsx`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/admin/roles/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';

interface LookupResult {
  uid: string;
  phoneNumber: string;
  role: string | null;
}

export default function AdminRolesPage() {
  const { user } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [roleInput, setRoleInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => setAuthorized(result.claims.role === 'admin'))
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    setError(null);
    setResult(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/admin/users/lookup?phone=${encodeURIComponent(phoneInput)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      setError('No account with that phone number.');
      return;
    }
    const body = await response.json();
    setResult(body);
    setRoleInput(body.role ?? '');
  };

  const handleSave = async () => {
    if (!result) return;
    setError(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/admin/users/${result.uid}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ role: roleInput || null }),
    });
    if (!response.ok) {
      setError('Could not update the role.');
      return;
    }
    const body = await response.json();
    setResult({ ...result, role: body.role });
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Role Management</h1>

      <label htmlFor="phone-lookup-input">Phone number</label>
      <input
        id="phone-lookup-input"
        aria-label="Phone number"
        value={phoneInput}
        onChange={(e) => setPhoneInput(e.target.value)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      />
      <button onClick={handleLookup} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Look up
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3 pt-4 border-t border-charcoal/10">
          <p>{result.phoneNumber}</p>
          <p>Current role: {result.role ?? 'None'}</p>

          <label htmlFor="role-select">Role</label>
          <select
            id="role-select"
            aria-label="Role"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            className="rounded border border-charcoal/20 px-3 py-2 w-fit"
          >
            <option value="">None</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>

          <button onClick={handleSave} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
            Save
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- admin/roles/page.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin/roles
git commit -m "feat(admin): add role-management page"
```

---

### Task 4: Full verification and PROJECT_STATUS.md update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including the new files above.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean across the five workspaces that have a `typecheck` script.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a `4e` row to the §3 phase roadmap table: "Phase 5 Plan B — Admin role management", complete, kept on `feature/admin-panel-and-production-queue`, linking [design](docs/superpowers/specs/2026-09-08-phase5-plan-b-admin-role-management-design.md) and [plan](docs/superpowers/plans/2026-09-08-phase5-plan-b-admin-role-management.md). Update the §4 test count. In §5's "No staff/admin account exists yet..." bullet, add a note that the role-management UI now exists for *ongoing* role changes — the *bootstrap* gap (no admin account exists yet on the live project) is unchanged and still requires running `set-user-role.ts` once manually.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 5 Plan B completion in PROJECT_STATUS.md"
```
