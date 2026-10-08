import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a) }));
import { revalidateCategoryPage, revalidateComboPages, revalidateProductPage, revalidateSitemaps } from './revalidate-catalogue';

const SITEMAPS = ['/sitemap.xml', '/sitemap-products.xml', '/sitemap-categories.xml', '/sitemap-images.xml', '/sitemap-combos.xml', '/feeds/google-merchant.xml'];
const paths = () => mockRevalidatePath.mock.calls.map((c) => c[0]);

describe('catalogue revalidation keeps SEO files fresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a product publish/edit/archive refreshes its page, every sitemap and the Merchant feed', () => {
    revalidateProductPage('desk-frame');
    expect(paths()).toEqual(expect.arrayContaining(['/product/desk-frame', ...SITEMAPS]));
  });

  it('a category change refreshes its page and the sitemaps', () => {
    revalidateCategoryPage('frames');
    expect(paths()).toEqual(expect.arrayContaining(['/category/frames', ...SITEMAPS]));
  });

  it('a combo change refreshes its pages and the sitemaps', () => {
    revalidateComboPages('triple-9');
    expect(paths()).toEqual(expect.arrayContaining(['/combo/triple-9', '/combos', '/', ...SITEMAPS]));
  });

  it('never throws when a refresh fails (a catalogue write must not turn into an error)', () => {
    mockRevalidatePath.mockImplementation(() => { throw new Error('cache down'); });
    expect(() => revalidateSitemaps()).not.toThrow();
  });
});
