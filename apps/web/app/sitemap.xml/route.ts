import { buildSitemapIndex, xmlResponse } from '../../lib/seo/sitemap-xml';
import { canonicalUrl } from '../../lib/seo/site';

export const revalidate = 3600;

/** No lastmod here on purpose: it would be a made-up "now"; each child sitemap carries the real per-page dates.
 * The index Google is given (https://karthysgallery.in/sitemap.xml); the real lists live in the child sitemaps. */
export async function GET(): Promise<Response> {
  return xmlResponse(
    buildSitemapIndex(
      ['sitemap-pages.xml', 'sitemap-categories.xml', 'sitemap-products.xml', 'sitemap-combos.xml', 'sitemap-images.xml'].map((name) => ({ loc: canonicalUrl(`/${name}`) }))
    )
  );
}
