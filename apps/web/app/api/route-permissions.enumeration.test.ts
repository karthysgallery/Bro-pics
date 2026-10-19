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
import { GET as frameModelsGET, POST as frameModelsPOST } from './admin/frame-models/route';
import { PATCH as frameModelPATCH } from './admin/frame-models/[id]/route';
import { GET as stockPhotosGET } from './admin/stock-photos/route';
import { GET as stockPhotoFileGET } from './admin/stock-photos/file/route';
import { GET as priceListsGET, POST as priceListsPOST } from './admin/price-lists/route';
import { PUT as priceListPUT, DELETE as priceListDELETE } from './admin/price-lists/[id]/route';
import { PUT as framingRatesPUT } from './admin/frame-models/rates/route';
import { POST as productSetupPOST } from './admin/products/setup/route';
import { POST as catalogueImagesPOST } from './admin/catalogue/images/route';
import { GET as productSetupOptionsGET } from './admin/products/setup/options/route';
import { GET as productSetupGET, PUT as productSetupPUT } from './admin/products/[id]/setup/route';
import { POST as pageApprovePOST, DELETE as pageApproveDELETE } from './admin/pages/[id]/approve/route';
import { GET as pagePreviewGET } from './admin/pages/[id]/preview/route';
import { GET as readinessGET } from './admin/readiness/route';
import { POST as contactsImportPOST } from './admin/whatsapp/contacts/import/route';
import { GET as contactsTemplateGET } from './admin/whatsapp/contacts/template/route';
import { PUT as contactConsentPUT } from './admin/whatsapp/contacts/[id]/consent/route';
import { PUT as templatesPUT } from './admin/whatsapp/templates/route';
import { PUT as pricingPUT } from './admin/whatsapp/pricing/route';
import { POST as campaignSendPOST } from './admin/marketing/campaigns/[id]/send/route';
import { GET as campaignReportGET } from './admin/marketing/campaigns/[id]/report/route';

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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  { name: 'GET /api/admin/frame-models', key: 'catalogue:read', wrongRole: 'staff', url: 'https://example.com/api/admin/frame-models', call: (r) => frameModelsGET(r) },
  { name: 'POST /api/admin/frame-models', key: 'catalogue:write', wrongRole: 'staff', method: 'POST', url: 'https://example.com/api/admin/frame-models', call: (r) => frameModelsPOST(r) },
  { name: 'PATCH /api/admin/frame-models/[id]', key: 'catalogue:write', wrongRole: 'staff', method: 'PATCH', url: 'https://example.com/api/admin/frame-models/teak', call: (r) => frameModelPATCH(r, { params: Promise.resolve({ id: 'teak' }) }) },
  { name: 'GET /api/admin/stock-photos', key: 'catalogue:write', wrongRole: 'staff', url: 'https://example.com/api/admin/stock-photos?q=child', call: (r) => stockPhotosGET(r) },
  { name: 'GET /api/admin/stock-photos/file', key: 'catalogue:write', wrongRole: 'staff', url: 'https://example.com/api/admin/stock-photos/file?u=x', call: (r) => stockPhotoFileGET(r) },
  { name: 'GET /api/admin/price-lists', key: 'catalogue:read', wrongRole: 'staff', url: 'https://example.com/api/admin/price-lists', call: (r) => priceListsGET(r) },
  { name: 'POST /api/admin/price-lists', key: 'catalogue:write', wrongRole: 'staff', method: 'POST', url: 'https://example.com/api/admin/price-lists', call: (r) => priceListsPOST(r) },
  { name: 'PUT /api/admin/price-lists/[id]', key: 'catalogue:write', wrongRole: 'staff', method: 'PUT', url: 'https://example.com/api/admin/price-lists/devotional', call: (r) => priceListPUT(r, { params: Promise.resolve({ id: 'devotional' }) }) },
  { name: 'DELETE /api/admin/price-lists/[id]', key: 'catalogue:write', wrongRole: 'staff', method: 'DELETE', url: 'https://example.com/api/admin/price-lists/devotional', call: (r) => priceListDELETE(r, { params: Promise.resolve({ id: 'devotional' }) }) },
  { name: 'PUT /api/admin/frame-models/rates', key: 'catalogue:write', wrongRole: 'staff', method: 'PUT', url: 'https://example.com/api/admin/frame-models/rates', call: (r) => framingRatesPUT(r) },
  { name: 'POST /api/admin/catalogue/images', key: 'catalogue:write', wrongRole: 'staff', method: 'POST', url: 'https://example.com/api/admin/catalogue/images', call: (r) => catalogueImagesPOST(r) },
  { name: 'POST /api/admin/products/setup', key: 'catalogue:write', wrongRole: 'staff', method: 'POST', url: 'https://example.com/api/admin/products/setup', call: (r) => productSetupPOST(r) },
  { name: 'GET /api/admin/products/setup/options', key: 'catalogue:read', wrongRole: 'staff', url: 'https://example.com/api/admin/products/setup/options', call: (r) => productSetupOptionsGET(r) },
  { name: 'GET /api/admin/products/[id]/setup', key: 'catalogue:read', wrongRole: 'staff', url: 'https://example.com/api/admin/products/p1/setup', call: (r) => productSetupGET(r, { params: Promise.resolve({ id: 'p1' }) }) },
  // What customers are promised: approving a legal page needs policies:approve, which a settings:write role (marketing_manager) lacks.
  { name: 'POST /api/admin/pages/[id]/approve', key: 'policies:approve', wrongRole: 'marketing_manager', method: 'POST', url: 'https://example.com/api/admin/pages/p1/approve', call: (r) => pageApprovePOST(r, { params: Promise.resolve({ id: 'p1' }) }) },
  { name: 'DELETE /api/admin/pages/[id]/approve', key: 'policies:approve', wrongRole: 'marketing_manager', method: 'DELETE', url: 'https://example.com/api/admin/pages/p1/approve', call: (r) => pageApproveDELETE(r, { params: Promise.resolve({ id: 'p1' }) }) },
  { name: 'GET /api/admin/pages/[id]/preview', key: 'content:write', wrongRole: 'catalogue_manager', url: 'https://example.com/api/admin/pages/p1/preview', call: (r) => pagePreviewGET(r, { params: Promise.resolve({ id: 'p1' }) }) },
  { name: 'GET /api/admin/readiness', key: 'settings:write', wrongRole: 'staff', url: 'https://example.com/api/admin/readiness', call: (r) => readinessGET(r) },
  // WhatsApp customer list and campaigns: administrator-only actions (a marketing_manager lacks every one of these keys).
  { name: 'POST /api/admin/whatsapp/contacts/import', key: 'whatsapp:contacts_import', wrongRole: 'marketing_manager', method: 'POST', url: 'https://example.com/api/admin/whatsapp/contacts/import', call: (r) => contactsImportPOST(r) },
  { name: 'GET /api/admin/whatsapp/contacts/template', key: 'whatsapp:contacts_import', wrongRole: 'marketing_manager', url: 'https://example.com/api/admin/whatsapp/contacts/template', call: (r) => contactsTemplateGET(r) },
  { name: 'PUT /api/admin/whatsapp/contacts/[id]/consent', key: 'whatsapp:consent_edit', wrongRole: 'marketing_manager', method: 'PUT', url: 'https://example.com/api/admin/whatsapp/contacts/p919876543210/consent', call: (r) => contactConsentPUT(r, { params: Promise.resolve({ id: 'p919876543210' }) }) },
  { name: 'PUT /api/admin/whatsapp/templates', key: 'whatsapp:templates_manage', wrongRole: 'marketing_manager', method: 'PUT', url: 'https://example.com/api/admin/whatsapp/templates', call: (r) => templatesPUT(r) },
  { name: 'PUT /api/admin/whatsapp/pricing', key: 'whatsapp:templates_manage', wrongRole: 'marketing_manager', method: 'PUT', url: 'https://example.com/api/admin/whatsapp/pricing', call: (r) => pricingPUT(r) },
  { name: 'POST /api/admin/marketing/campaigns/[id]/send', key: 'whatsapp:campaign_send', wrongRole: 'marketing_manager', method: 'POST', url: 'https://example.com/api/admin/marketing/campaigns/c1/send', call: (r) => campaignSendPOST(r, { params: Promise.resolve({ id: 'c1' }) }) },
  { name: 'GET /api/admin/marketing/campaigns/[id]/report?format=csv', key: 'whatsapp:export', wrongRole: 'marketing_manager', url: 'https://example.com/api/admin/marketing/campaigns/c1/report?format=csv', call: (r) => campaignReportGET(r, { params: Promise.resolve({ id: 'c1' }) }) },
  { name: 'PUT /api/admin/products/[id]/setup', key: 'catalogue:write', wrongRole: 'staff', method: 'PUT', url: 'https://example.com/api/admin/products/p1/setup', call: (r) => productSetupPUT(r, { params: Promise.resolve({ id: 'p1' }) }) },
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
