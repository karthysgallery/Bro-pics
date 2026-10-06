import type { Product, ProductMedia, Review, Variant } from '@bro-pics/shared';
import { SUPPORT_EMAIL } from './support-contact';
import { buildPublicMediaUrl } from './media-public-url';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://karthysgallery.in';
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
    name: 'KarthysGallery',
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
      author: { '@type': 'Person', name: 'Verified KarthysGallery customer' },
      reviewBody: review.body,
      name: review.title,
    }));
}

/** Absolute URL for an image path (Google needs full addresses). */
function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * The Product structured data Google reads for rich results (price, stock,
 * stars, images). Price ranges become an AggregateOffer across all sizes.
 */
export function buildProductJsonLd(input: {
  product: Pick<Product, 'title' | 'slug' | 'shortDesc' | 'primaryImageUrl' | 'ratingAverage' | 'ratingCount' | 'seo'>;
  variants: Pick<Variant, 'sku' | 'price' | 'stockStatus'>[];
  media: Pick<ProductMedia, 'type' | 'url'>[];
  reviews: Review[];
  categoryName?: string;
  now?: Date;
}) {
  const { product, variants, media, reviews } = input;
  const seo = product.seo ?? {};
  const url = `${SITE_URL}/product/${product.slug}`;
  const images = [...new Set([product.primaryImageUrl, ...media.filter((m) => m.type === 'image').map((m) => m.url)].filter(Boolean))]
    .slice(0, 8)
    .map(absoluteUrl);
  const inStock = variants.some((v) => v.stockStatus === 'in_stock');
  const availability = inStock ? 'https://schema.org/InStock' : variants.some((v) => v.stockStatus === 'backorder') ? 'https://schema.org/BackOrder' : 'https://schema.org/OutOfStock';
  const prices = variants.map((v) => v.price / 100);
  const validUntil = new Date((input.now ?? new Date()).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const keywords = [seo.focusKeyword, ...(seo.keywords ?? [])].filter((k): k is string => Boolean(k && k.trim()));
  const productReviews = buildProductReviewsJsonLd(reviews);
  const seller = { '@type': 'Organization', name: 'KarthysGallery' };

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: seo.description || product.shortDesc,
    url,
    ...(images.length > 0 && { image: images }),
    ...(variants[0]?.sku && { sku: variants[0].sku }),
    brand: { '@type': 'Brand', name: 'KarthysGallery' },
    ...(input.categoryName && { category: input.categoryName }),
    ...(keywords.length > 0 && { keywords: keywords.join(', ') }),
    ...(product.ratingCount > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.ratingAverage, reviewCount: product.ratingCount } }),
    ...(productReviews.length > 0 && { review: productReviews }),
    ...(prices.length > 0 && {
      offers:
        prices.length > 1 && Math.min(...prices) !== Math.max(...prices)
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'INR',
              lowPrice: Math.min(...prices).toFixed(2),
              highPrice: Math.max(...prices).toFixed(2),
              offerCount: prices.length,
              availability,
              url,
              seller,
            }
          : {
              '@type': 'Offer',
              price: prices[0].toFixed(2),
              priceCurrency: 'INR',
              priceValidUntil: validUntil,
              itemCondition: 'https://schema.org/NewCondition',
              availability,
              url,
              seller,
            },
    }),
  };
}
