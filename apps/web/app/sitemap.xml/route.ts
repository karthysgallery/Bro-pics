import { buildSitemapIndex, xmlResponse } from '../../lib/seo/sitemap-xml';
import { canonicalUrl } from '../../lib/seo/site';

export const revalidate = 3600;

/** The index Google is given (https://karthysgallery.in/sitemap.xml); the real lists live in the child sitemaps. */
export async function GET(): Promise<Response> {
  const now = new Date();
  return xmlResponse(
    buildSitemapIndex(
      ['sitemap-pages.xml', 'sitemap-categories.xml', 'sitemap-products.xml', 'sitemap-combos.xml', 'sitemap-images.xml'].map((name) => ({ loc: canonicalUrl(`/${name}`), lastmod: now }))
    )
  );
}
