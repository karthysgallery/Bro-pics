import { buildUrlset, xmlResponse } from '../../lib/seo/sitemap-xml';
import { pageSitemapEntries } from '../../lib/seo/sitemap-data';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  return xmlResponse(buildUrlset(pageSitemapEntries()));
}
