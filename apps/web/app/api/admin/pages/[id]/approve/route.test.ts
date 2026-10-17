import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../../../../lib/legal-values', () => ({
  loadLegalValues: async () => ({ businessName: 'Shop', supportEmail: 'help@example.test' }),
}));
const mockPageGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockPageGet, update: mockUpdate }) }) }),
  FieldValue: { delete: () => '__delete__' },
}));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

import { POST, DELETE } from './route';
import { textFingerprint } from '@bro-pics/shared';

const ctx = { params: Promise.resolve({ id: 'p1' }) };
const req = (method = 'POST') => new Request('https://example.com/api/admin/pages/p1/approve', { method });
const LONG = '<p>Email us at {{supportEmail}}. This page has enough ordinary text to count as a real policy body.</p>';

describe('approving a legal page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'admin_1' });
  });

  it('asks for policies:approve, and refuses anyone without it (403) without touching the page', async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, status: 403 });
    expect((await POST(req(), ctx)).status).toBe(403);
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'policies:approve');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a page that is not a legal page', async () => {
    mockPageGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'faq', bodyHtml: LONG }) });
    expect((await POST(req(), ctx)).status).toBe(400);
  });

  it('refuses (409) while a fact is missing or an internal note is left, and records no approval', async () => {
    for (const body of [`${LONG}<p>Call {{supportPhone}}</p>`, `${LONG}<p>NEEDS OWNER CONFIRMATION</p>`]) {
      mockPageGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'terms', bodyHtml: body }) });
      const res = await POST(req(), ctx);
      expect(res.status).toBe(409);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('approves complete text, binding the approval to the exact text and recording who and when', async () => {
    mockPageGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'terms', bodyHtml: LONG }) });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ approvedHash: textFingerprint(LONG), approvedBy: 'admin_1' }));
  });

  it('withdrawing removes the approval and unpublishes the page', async () => {
    mockPageGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'terms', bodyHtml: LONG }) });
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ approvedHash: '__delete__', isPublished: false }));
  });
});
