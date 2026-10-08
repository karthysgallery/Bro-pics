import { buildUrlset, xmlResponse } from '../../lib/seo/sitemap-xml';
import { comboSitemapEntries } from '../../lib/seo/sitemap-data';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  return xmlResponse(buildUrlset(await comboSitemapEntries()));
}
