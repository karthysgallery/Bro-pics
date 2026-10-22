import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../firebase-admin', () => ({ getAdminApp: vi.fn() }));

import type { Product } from '@bro-pics/shared';
import { LANDING_PAGES, landingPageBySlug, productMatchesLanding } from './landing-pages';
import { pageSitemapEntries } from './sitemap-data';

const product = (title: string, occasionTags: string[] = []) => ({ id: title, title, slug: title, occasionTags }) as unknown as Product;

describe('landing pages', () => {
  it('have unique slugs, titles and descriptions, and only link to pages that exist', () => {
    expect(new Set(LANDING_PAGES.map((p) => p.slug)).size).toBe(LANDING_PAGES.length);
    expect(new Set(LANDING_PAGES.map((p) => p.title)).size).toBe(LANDING_PAGES.length);
    for (const p of LANDING_PAGES) {
      expect(p.title.length, p.slug).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(160);
      expect(p.faq.length, p.slug).toBeGreaterThan(0);
      for (const r of p.related) expect(landingPageBySlug(r), `${p.slug} → ${r}`).toBeTruthy();
    }
  });

  it('match products by name words', () => {
    const collage = landingPageBySlug('photo-collage-frames')!;
    expect(productMatchesLanding(collage, product('Heart Photo Collage Frame'))).toBe(true);
    expect(productMatchesLanding(collage, product('Single Photo Frame'))).toBe(false);
    expect(productMatchesLanding(landingPageBySlug('personalised-photo-frames')!, product('Anything'))).toBe(true);
  });
});

describe('pageSitemapEntries', () => {
  it('lists only live legal pages and landing pages that have products', () => {
    const locs = pageSitemapEntries(['about'], ['photo-collage-frames']).map((e) => new URL(e.loc).pathname);
    expect(locs).toContain('/photo-frames/photo-collage-frames');
    expect(locs).not.toContain('/photo-frames/calendar-photo-frames');
    expect(locs).toContain('/about');
    expect(locs).not.toContain('/privacy');
  });

  it('lists every landing page when product data is unavailable', () => {
    const locs = pageSitemapEntries().map((e) => new URL(e.loc).pathname);
    for (const p of LANDING_PAGES) expect(locs).toContain(`/photo-frames/${p.slug}`);
  });
});
