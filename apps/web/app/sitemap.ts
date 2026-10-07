import type { MetadataRoute } from 'next';
import { getSitemapProducts } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';
import { getPublishedCombos } from '../lib/firestore-combos';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://karthysgallery.in';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A combos lookup failure must never take the whole sitemap down.
  const [products, categories, combos] = await Promise.all([getSitemapProducts(), getActiveCategories(), getPublishedCombos().catch(() => [])]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/search`, changeFrequency: 'weekly', priority: 0.5 },
    // [BE-40] The static CMS/content pages (apps/web/app/(content)/*) were
    // missing entirely — real, crawlable, indexable pages that simply
    // never appeared in the sitemap. Lower priority than product/category
    // pages since they're not what search traffic is meant to land on,
    // but still worth a crawler knowing about.
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/faq`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/picture-quality-guide`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${baseUrl}/return-refund-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${baseUrl}/shipping-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Product pages carry their last change and main photo, so search engines
  // re-read edited products sooner and can list the photo in image search.
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${baseUrl}/product/${p.slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
    ...(p.updatedAt && { lastModified: p.updatedAt }),
    ...(p.image && { images: [/^https?:\/\//.test(p.image) ? p.image : `${baseUrl}${p.image}`] }),
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/category/${category.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const comboRoutes: MetadataRoute.Sitemap = combos.length
    ? [
        { url: `${baseUrl}/combos`, changeFrequency: 'weekly', priority: 0.6 },
        ...combos.map((c) => ({
          url: `${baseUrl}/combo/${c.slug}`,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
          lastModified: c.updatedAt,
          ...(c.coverImageUrl && { images: [/^https?:\/\//.test(c.coverImageUrl) ? c.coverImageUrl : `${baseUrl}${c.coverImageUrl}`] }),
        })),
      ]
    : [];

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...comboRoutes];
}
