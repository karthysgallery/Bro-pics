import { buildUrlset, xmlResponse } from '../../lib/seo/sitemap-xml';
import { getIndexableProducts, pageSitemapEntries } from '../../lib/seo/sitemap-data';
import { getLiveLegalSlugs } from '../../lib/firestore-content';
import { LANDING_PAGES, productMatchesLanding } from '../../lib/seo/landing-pages';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const [live, products] = await Promise.all([getLiveLegalSlugs().catch(() => undefined), getIndexableProducts().catch(() => undefined)]);
  const stocked = products && LANDING_PAGES.filter((l) => products.some((p) => productMatchesLanding(l, p))).map((l) => l.slug);
  return xmlResponse(buildUrlset(pageSitemapEntries(live, stocked)));
}
