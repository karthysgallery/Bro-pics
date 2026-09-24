import type { MetadataRoute } from 'next';
import { getAllActiveProductSlugs } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productSlugs, categories] = await Promise.all([getAllActiveProductSlugs(), getActiveCategories()]);

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

  const productRoutes: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: `${baseUrl}/product/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/category/${category.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
