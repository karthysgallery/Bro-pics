import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockPagesGet = vi.fn();
const mockFaqsGet = vi.fn();

vi.mock('./firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'pages') {
        return { where: () => ({ limit: () => ({ get: mockPagesGet }) }) };
      }
      if (name === 'faqs') {
        return { where: () => ({ get: mockFaqsGet }) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  }),
}));

vi.mock('./legal-values', () => ({ loadLegalValues: async () => ({}) }));

import { getPageBySlug, getActiveFaqs } from './firestore-content';
import { textFingerprint } from '@bro-pics/shared';

const LEGAL_BODY = '<p>A reasonably long policy page body so that it is not treated as empty text by the safety checks.</p>';

const pageDoc = {
  id: 'page_about',
  slug: 'about',
  title: 'About KarthysGallery',
  bodyHtml: '<p>Hello</p>',
  seo: {},
  isPublished: true,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('getPageBySlug', () => {
  it('[FE-28] returns null when no page doc exists for the slug', async () => {
    mockPagesGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const page = await getPageBySlug('never-authored');
    expect(page).toBeNull();
  });

  it('[FE-28] returns the parsed page when published (a non-legal page needs no approval)', async () => {
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ ...pageDoc, slug: 'faq', title: 'FAQ' }) }] });
    const page = await getPageBySlug('faq');
    expect(page?.title).toBe('FAQ');
    expect(page?.bodyHtml).toBe('<p>Hello</p>');
  });

  it('reads a page whose dates come back from Firestore as Timestamps (not Dates)', async () => {
    const ts = (iso: string) => ({ toDate: () => new Date(iso) });
    const approved = { ...pageDoc, slug: 'terms', bodyHtml: LEGAL_BODY, approvedHash: textFingerprint(LEGAL_BODY), updatedAt: ts('2026-01-01T00:00:00Z'), approvedAt: ts('2026-01-02T00:00:00Z'), approvedBy: 'admin_1' };
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => approved }] });
    expect((await getPageBySlug('terms'))?.bodyHtml).toBe(LEGAL_BODY);
  });

  it('never shows a legal page that is published but not approved', async () => {
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ ...pageDoc, slug: 'terms', bodyHtml: LEGAL_BODY }) }] });
    expect(await getPageBySlug('terms')).toBeNull();
  });

  it('shows a legal page only while the approval matches the exact text', async () => {
    const approved = { ...pageDoc, slug: 'terms', bodyHtml: LEGAL_BODY, approvedHash: textFingerprint(LEGAL_BODY) };
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => approved }] });
    expect((await getPageBySlug('terms'))?.bodyHtml).toBe(LEGAL_BODY);
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ ...approved, bodyHtml: `${LEGAL_BODY} edited after approval` }) }] });
    expect(await getPageBySlug('terms')).toBeNull();
  });

  it('never shows an approved legal page that still has an unfilled {{token}} or an internal note', async () => {
    for (const body of [`${LEGAL_BODY}<p>Email {{supportEmail}}</p>`, `${LEGAL_BODY}<p>NEEDS OWNER CONFIRMATION</p>`]) {
      mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ ...pageDoc, slug: 'terms', bodyHtml: body, approvedHash: textFingerprint(body) }) }] });
      expect(await getPageBySlug('terms')).toBeNull();
    }
  });

  it('[FE-28] returns null for an unpublished (draft) page, never showing it to a visitor', async () => {
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ ...pageDoc, isPublished: false }) }] });
    const page = await getPageBySlug('terms');
    expect(page).toBeNull();
  });
});

describe('getActiveFaqs', () => {
  it('[FE-28] returns an empty array when no faqs exist yet', async () => {
    mockFaqsGet.mockResolvedValueOnce({ docs: [] });
    const faqs = await getActiveFaqs();
    expect(faqs).toEqual([]);
  });

  it('[FE-28] returns faqs sorted by sortOrder', async () => {
    mockFaqsGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ id: 'f2', section: 'Photos', question: 'Q2', answerHtml: '<p>A2</p>', sortOrder: 1, isActive: true }) },
        { data: () => ({ id: 'f1', section: 'Photos', question: 'Q1', answerHtml: '<p>A1</p>', sortOrder: 0, isActive: true }) },
      ],
    });
    const faqs = await getActiveFaqs();
    expect(faqs.map((f) => f.question)).toEqual(['Q1', 'Q2']);
  });
});
