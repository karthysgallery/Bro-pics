import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { isLegalSlug, type Category, type Product, type ProductMedia } from '@bro-pics/shared';
import { getAdminApp } from '../firebase-admin';
import { getPublishedCombos } from '../firestore-combos';
import { absoluteUrl, canonicalUrl } from './site';
import type { SitemapEntry, SitemapImage } from './sitemap-xml';
import { LANDING_PAGES } from './landing-pages';

/** Public information pages that exist as routes (app/(content)/*). Keep in step with those routes. */
export const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: SitemapEntry['changefreq'] }> = [
  { path: '/about', priority: 0.4, changefreq: 'monthly' },
  { path: '/how-it-works', priority: 0.5, changefreq: 'monthly' },
  { path: '/picture-quality-guide', priority: 0.5, changefreq: 'monthly' },
  { path: '/faq', priority: 0.4, changefreq: 'monthly' },
  { path: '/contact', priority: 0.3, changefreq: 'monthly' },
  { path: '/shipping-policy', priority: 0.2, changefreq: 'yearly' },
  { path: '/return-refund-policy', priority: 0.2, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.1, changefreq: 'yearly' },
  { path: '/terms', priority: 0.1, changefreq: 'yearly' },
];

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date } | undefined;
  return typeof maybe?.toDate === 'function' ? maybe.toDate() : undefined;
}

/**
 * Products that may appear in search: published (isActive) and not marked noindex by the owner. The ONE definition
 * of "indexable product", used by the sitemaps, the Merchant feed and the SEO audit so they can never disagree.
 */
export async function getIndexableProducts(): Promise<Array<Product & { updatedAtDate?: Date }>> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('products').where('isActive', '==', true).get();
  return snap.docs
    .map((doc) => ({ ...(doc.data() as Product), id: doc.id }))
    .filter((p) => !p.seo?.noindex)
    .map((p) => ({ ...p, updatedAtDate: toDate((p as unknown as { updatedAt?: unknown }).updatedAt) }));
}

/** Product photos by product id, from each product's own media subcollection (images only, in display order). */
export async function getProductImages(): Promise<Map<string, ProductMedia[]>> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collectionGroup('media').get();
  const byProduct = new Map<string, ProductMedia[]>();
  for (const doc of snap.docs) {
    // The root `media` collection is the admin media library, not product photos: keep only products/{id}/media/*.
    if (doc.ref.parent.parent?.parent.id !== 'products') continue;
    const media = doc.data() as ProductMedia;
    if (media.type !== 'image' || !media.url) continue;
    const productId = doc.ref.parent.parent.id;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), media]);
  }
  for (const list of byProduct.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return byProduct;
}

function imageEntries(product: Product, media: ProductMedia[]): SitemapImage[] {
  const seen = new Set<string>();
  const images: SitemapImage[] = [];
  const add = (url: string | undefined | null, alt: string | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ loc: absoluteUrl(url), title: product.title, ...(alt && { caption: alt }) });
  };
  add(product.primaryImageUrl, product.seo?.imageAlt || product.title);
  for (const m of media) add(m.url, m.alt || undefined);
  return images.slice(0, 20);
}

export async function productSitemapEntries(): Promise<SitemapEntry[]> {
  const [products, images] = await Promise.all([getIndexableProducts(), getProductImages()]);
  return products.map((p) => ({
    loc: canonicalUrl(`/product/${p.slug}`),
    ...(p.updatedAtDate && { lastmod: p.updatedAtDate }),
    changefreq: 'weekly' as const,
    priority: 0.8,
    images: imageEntries(p, images.get(p.id) ?? []),
  }));
}

/** Image sitemap: the same product pages, each listing all of its photos (the main sitemap lists them too; this one is the dedicated feed for Google Images). */
export async function imageSitemapEntries(): Promise<SitemapEntry[]> {
  return (await productSitemapEntries()).filter((e) => (e.images?.length ?? 0) > 0).map(({ loc, images, lastmod }) => ({ loc, images, ...(lastmod && { lastmod }) }));
}

/** Categories that are active AND have at least one published product — an empty category is a thin page and stays out. */
export async function categorySitemapEntries(): Promise<SitemapEntry[]> {
  const db = getFirestore(getAdminApp());
  const [catSnap, products] = await Promise.all([db.collection('categories').where('isActive', '==', true).get(), getIndexableProducts()]);
  const withProducts = new Set(products.map((p) => p.categoryId));
  const categories = catSnap.docs.map((d) => d.data() as Category).filter((c) => withProducts.has(c.id) || catSnap.docs.some((o) => (o.data() as Category).parentId === c.id));
  const latestByCategory = new Map<string, Date>();
  for (const p of products) {
    if (p.updatedAtDate && (!latestByCategory.has(p.categoryId) || p.updatedAtDate > latestByCategory.get(p.categoryId)!)) latestByCategory.set(p.categoryId, p.updatedAtDate);
  }
  const entries: SitemapEntry[] = categories.map((c) => ({
    loc: canonicalUrl(`/category/${c.slug}`),
    ...(latestByCategory.get(c.id) && { lastmod: latestByCategory.get(c.id) }),
    changefreq: 'weekly',
    priority: 0.7,
  }));
  if (products.length > 0) entries.unshift({ loc: canonicalUrl('/category'), changefreq: 'daily', priority: 0.9 });
  return entries;
}

export async function comboSitemapEntries(): Promise<SitemapEntry[]> {
  const combos = await getPublishedCombos().catch(() => []);
  if (combos.length === 0) return [];
  return [
    { loc: canonicalUrl('/combos'), changefreq: 'weekly', priority: 0.7 },
    ...combos.map((c) => ({
      loc: canonicalUrl(`/combo/${c.slug}`),
      lastmod: c.updatedAt,
      changefreq: 'weekly' as const,
      priority: 0.7,
      ...(c.coverImageUrl && { images: [{ loc: absoluteUrl(c.coverImageUrl), title: c.name, ...(c.coverImageAlt && { caption: c.coverImageAlt }) }] }),
    })),
  ];
}

/**
 * Legal pages (about, contact, policies) are listed only while their approved text is live, and landing pages only while
 * they show at least one product — otherwise both are noindex.
 */
export function pageSitemapEntries(liveLegalSlugs?: string[], stockedLandingSlugs?: string[]): SitemapEntry[] {
  return [
    { loc: canonicalUrl('/'), changefreq: 'daily', priority: 1 },
    { loc: canonicalUrl('/photo-frames'), changefreq: 'weekly', priority: 0.8 },
    ...LANDING_PAGES.filter((p) => !stockedLandingSlugs || stockedLandingSlugs.includes(p.slug)).map((p) => ({
      loc: canonicalUrl(`/photo-frames/${p.slug}`),
      changefreq: 'weekly' as const,
      priority: 0.8,
    })),
    ...STATIC_PAGES.filter((p) => !liveLegalSlugs || !isLegalSlug(p.path.slice(1)) || liveLegalSlugs.includes(p.path.slice(1))).map((p) => ({
      loc: canonicalUrl(p.path),
      changefreq: p.changefreq,
      priority: p.priority,
    })),
  ];
}
