import type { Review } from '@bro-pics/shared';
import { SUPPORT_EMAIL } from './support-contact';
import { buildPublicMediaUrl } from './media-public-url';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com';
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000';

/**
 * [FE-41] `BreadcrumbList` for whatever trail a page's own visible
 * breadcrumb nav already renders — one function shared by every page
 * that has one, so the JSON-LD can never drift from what's actually
 * shown (the product and category pages each build the identical
 * Home → … → current-page trail already visible in their own `<nav>`).
 */
export function buildBreadcrumbList(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * [FE-41] One `Organization` entity for the whole site — rendered once,
 * sitewide (the root layout), not per page, since the organization
 * itself doesn't change page to page.
 */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BroPics',
    url: SITE_URL,
    email: SUPPORT_EMAIL,
    sameAs: [`https://wa.me/${WHATSAPP_NUMBER}`],
  };
}

/**
 * [FE-42] `settings/seo.ogImagePath` (ABE-24, no reader anywhere until
 * now) as the OG-image fallback for a product/category with no image of
 * its own — never overrides a REAL image, only fills the gap when the
 * page's own field is empty. `ogImagePath` is a Storage object path
 * (never a URL, matching every other `*Path` field in this codebase),
 * resolved here via `buildPublicMediaUrl` — the one caller-facing seam
 * a page's `generateMetadata` needs.
 */
export function resolveOgImage(ownImageUrl: string, seoSettings: { ogImagePath?: string } | null): string | undefined {
  if (ownImageUrl) return ownImageUrl;
  return seoSettings?.ogImagePath ? buildPublicMediaUrl(seoSettings.ogImagePath) : undefined;
}

/**
 * [FE-41] `Review` entries for a Product's JSON-LD `review` array —
 * only ever built from already-`approved` reviews (the same set
 * `ReviewsSection` already renders to visitors; a `pending`/`rejected`
 * review is never publicly visible and must never be publicly claimed
 * as a real customer review in structured data either).
 */
export function buildProductReviewsJsonLd(reviews: Review[]) {
  return reviews
    .filter((review) => review.status === 'approved')
    .map((review) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
      author: { '@type': 'Person', name: 'Verified BroPics customer' },
      reviewBody: review.body,
      name: review.title,
    }));
}
