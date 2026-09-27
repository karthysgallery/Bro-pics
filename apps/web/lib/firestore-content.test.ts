import { describe, it, expect, vi } from 'vitest';

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

import { getPageBySlug, getActiveFaqs } from './firestore-content';

const pageDoc = {
  id: 'page_about',
  slug: 'about',
  title: 'About BroPics',
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

  it('[FE-28] returns the parsed page when published', async () => {
    mockPagesGet.mockResolvedValueOnce({ empty: false, docs: [{ data: () => pageDoc }] });
    const page = await getPageBySlug('about');
    expect(page?.title).toBe('About BroPics');
    expect(page?.bodyHtml).toBe('<p>Hello</p>');
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
