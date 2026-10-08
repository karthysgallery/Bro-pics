import { buildUrlset, xmlResponse } from '../../lib/seo/sitemap-xml';
import { productSitemapEntries } from '../../lib/seo/sitemap-data';

export const revalidate = 3600;

/** Every published, indexable product — straight from the catalogue, so a new product appears here with no extra step. */
export async function GET(): Promise<Response> {
  return xmlResponse(buildUrlset(await productSitemapEntries()));
}
