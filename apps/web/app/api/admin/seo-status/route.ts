import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { analyseProductSeo, missingBusinessDetails, LEGAL_PAGE_SLUGS, type Product } from '@bro-pics/shared';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { getBusinessDetails, getSeoSettings } from '../../../../lib/firestore-settings';
import { getLiveLegalSlugs } from '../../../../lib/firestore-content';
import { getIndexableProducts } from '../../../../lib/seo/sitemap-data';
import { LANDING_PAGES, productMatchesLanding } from '../../../../lib/seo/landing-pages';
import { canonicalUrl } from '../../../../lib/seo/site';

/** GET /api/admin/seo-status — what Google can see of the shop, and what is still missing. Read-only. */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = checkRateLimit(request, 'staff');
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');

  const db = getFirestore(getAdminApp());
  const [seo, business, liveLegal, products, publishedSnap] = await Promise.all([
    getSeoSettings().catch(() => null),
    getBusinessDetails().catch(() => null),
    getLiveLegalSlugs().catch(() => [] as string[]),
    getIndexableProducts().catch(() => []),
    db.collection('products').where('isActive', '==', true).select('title').get(),
  ]);

  const weak = products
    .map((p: Product) => {
      const report = analyseProductSeo({
        title: p.title,
        slug: p.slug,
        shortDesc: p.shortDesc ?? '',
        descriptionHtml: p.descriptionHtml ?? '',
        seoTitle: p.seo?.title,
        seoDescription: p.seo?.description,
        focusKeyword: p.seo?.focusKeyword,
        keywords: p.seo?.keywords,
        imageAlt: p.seo?.imageAlt,
        hasImage: Boolean(p.primaryImageUrl),
      });
      return { id: p.id, title: p.title, score: report.score };
    })
    .filter((r) => r.score < 100)
    .sort((a, b) => a.score - b.score);

  return NextResponse.json({
    googleVerified: Boolean(seo?.googleVerification),
    businessMissing: missingBusinessDetails(business),
    businessName: business?.name ?? null,
    legalPages: LEGAL_PAGE_SLUGS.map((slug) => ({ slug, live: liveLegal.includes(slug) })),
    products: { published: publishedSnap.size, indexable: products.length, weak: weak.slice(0, 20), weakCount: weak.length },
    landingPages: LANDING_PAGES.map((l) => ({ slug: l.slug, title: l.h1, keyword: l.keyword, products: products.filter((p) => productMatchesLanding(l, p)).length, url: canonicalUrl(`/photo-frames/${l.slug}`) })),
    links: { sitemap: canonicalUrl('/sitemap.xml'), merchantFeed: canonicalUrl('/feeds/google-merchant.xml'), site: canonicalUrl('/') },
  });
}
