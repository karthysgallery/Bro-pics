/**
 * [ABE-02] Route-enumeration test: asserts 401 for a caller with no valid
 * identity and 403 for a caller who IS authenticated but lacks the
 * specific permission (a customer, or staff/content_manager calling an
 * admin-only route), across every /api/admin/* and /api/staff/* route.
 * Unlike each route's own scattered auth tests (which mock
 * requirePermission directly), this exercises the REAL requirePermission
 * implementation against a mocked Firebase token, so a route that silently
 * stops calling requirePermission — or calls it with the wrong key — would
 * still be caught here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PermissionKey } from '@bro-pics/shared';

vi.mock('server-only', () => ({}));

const mockVerifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    getUserByPhoneNumber: vi.fn(),
  })),
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(() => ({})) }));
vi.mock('../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rate-limit')>();
  return { ...actual };
});

import { resetRateLimitState } from '../../lib/rate-limit';
import { POST as roleGrantPOST } from './admin/users/[uid]/role/route';
import { GET as userLookupGET } from './admin/users/lookup/route';
import { GET as staffOrdersGET } from './staff/orders/route';
import { GET as staffOrderDetailGET } from './staff/orders/[orderNo]/route';
import { POST as staffOrderAdvancePOST } from './staff/orders/[orderNo]/advance/route';
import { GET as staffReturnsGET } from './staff/returns/route';
import { POST as staffReturnAdvancePOST } from './staff/returns/[returnId]/route';
import { GET as staffReviewsGET } from './staff/reviews/route';
import { POST as staffReviewModeratePOST } from './staff/reviews/[id]/moderate/route';

function anonymousRequest(url: string, method = 'GET'): Request {
  return new Request(url, { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {}, body: method === 'POST' ? '{}' : undefined });
}

function authedRequest(url: string, method = 'GET'): Request {
  return new Request(url, {
    method,
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined,
  });
}

interface RouteCase {
  name: string;
  key: PermissionKey;
  // A role that is a real, valid role but does not grant `key`.
  wrongRole: string;
  call: (request: Request) => Promise<Response>;
  url: string;
  method?: 'GET' | 'POST';
}

const cases: RouteCase[] = [
  {
    name: 'POST /api/admin/users/[uid]/role',
    key: 'team:manage',
    wrongRole: 'staff',
    method: 'POST',
    url: 'https://example.com/api/admin/users/user_9/role',
    call: (request) => roleGrantPOST(request, { params: Promise.resolve({ uid: 'user_9' }) }),
  },
  {
    name: 'GET /api/admin/users/lookup',
    key: 'team:manage',
    wrongRole: 'staff',
    url: 'https://example.com/api/admin/users/lookup?phone=%2B911234567890',
    call: (request) => userLookupGET(request),
  },
  {
    name: 'GET /api/staff/orders',
    key: 'orders:read',
    wrongRole: 'content_manager',
    url: 'https://example.com/api/staff/orders?status=paid',
    call: (request) => staffOrdersGET(request),
  },
  {
    name: 'GET /api/staff/orders/[orderNo]',
    key: 'orders:read',
    wrongRole: 'content_manager',
    url: 'https://example.com/api/staff/orders/BP-2026-00001',
    call: (request) => staffOrderDetailGET(request, { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }),
  },
  {
    name: 'POST /api/staff/orders/[orderNo]/advance',
    key: 'orders:write',
    wrongRole: 'content_manager',
    method: 'POST',
    url: 'https://example.com/api/staff/orders/BP-2026-00001/advance',
    call: (request) => staffOrderAdvancePOST(request, { params: Promise.resolve({ orderNo: 'BP-2026-00001' }) }),
  },
  {
    name: 'GET /api/staff/returns',
    key: 'returns:read',
    wrongRole: 'content_manager',
    url: 'https://example.com/api/staff/returns',
    call: (request) => staffReturnsGET(request),
  },
  {
    name: 'POST /api/staff/returns/[returnId]',
    key: 'returns:write',
    wrongRole: 'content_manager',
    method: 'POST',
    url: 'https://example.com/api/staff/returns/ret_1',
    call: (request) => staffReturnAdvancePOST(request, { params: Promise.resolve({ returnId: 'ret_1' }) }),
  },
  {
    name: 'GET /api/staff/reviews',
    key: 'reviews:moderate',
    wrongRole: 'content_manager',
    url: 'https://example.com/api/staff/reviews?status=pending',
    call: (request) => staffReviewsGET(request),
  },
  {
    name: 'POST /api/staff/reviews/[id]/moderate',
    key: 'reviews:moderate',
    wrongRole: 'content_manager',
    method: 'POST',
    url: 'https://example.com/api/staff/reviews/review_1/moderate',
    call: (request) => staffReviewModeratePOST(request, { params: Promise.resolve({ id: 'review_1' }) }),
  },
];

describe('[ABE-02] admin/staff route permission enumeration', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  for (const { name, wrongRole, call, url, method } of cases) {
    it(`${name} returns 401 for an anonymous caller (no Authorization header)`, async () => {
      const response = await call(anonymousRequest(url, method));
      expect(response.status).toBe(401);
    });

    it(`${name} returns 403 for an authenticated caller whose role (${wrongRole}) lacks the permission`, async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'wrong_role_1', role: wrongRole });
      const response = await call(authedRequest(url, method));
      expect(response.status).toBe(403);
    });

    it(`${name} returns 403 for an authenticated caller with no role claim at all (a plain customer)`, async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'customer_1' });
      const response = await call(authedRequest(url, method));
      expect(response.status).toBe(403);
    });
  }
});
