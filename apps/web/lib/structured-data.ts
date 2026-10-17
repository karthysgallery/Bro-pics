import type { Product, ProductMedia, Review, Variant } from '@bro-pics/shared';
import { buildPublicMediaUrl } from './media-public-url';

import { CANONICAL_ORIGIN as SITE_URL } from './seo/site';

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
export function buildOrganizationJsonLd(contact: { email?: string; whatsappDigits?: string } = {}) {
  // Only details the owner has saved are published; there is no built-in email or number.
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KarthysGallery',
    url: SITE_URL,
    ...(contact.email && { email: contact.email }),
    ...(contact.whatsappDigits && { sameAs: [`https://wa.me/${contact.whatsappDigits}`] }),
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
      author: { '@type': 'Person', name: review.isVerified ? 'Verified buyer' : 'KarthysGallery customer' },
      reviewBody: review.body,
      name: review.title,
    }));
}

/** Absolute URL for an image path (Google needs full addresses). */
function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Facts about delivery that are true of every offer on the page; each is shown to the customer on the product page. */
export interface ShippingFacts {
  /** ISO 3166-2:IN code of the state that ships free (the owner's policy: Tamil Nadu = "TN"). Other states are not stated here: their charge is set per state and shown at checkout. */
  freeStateCode: string;
  dispatchDaysMin: number;
  dispatchDaysMax: number;
}

export interface JsonLdVariant {
  id?: string;
  sku: string;
  price: number;
  stockStatus: string;
  sizeLabel?: string;
  frameColour?: string;
  material?: string;
}

function availabilityOf(stockStatus: string): string {
  if (stockStatus === 'in_stock') return 'https://schema.org/InStock';
  if (stockStatus === 'backorder') return 'https://schema.org/BackOrder';
  return 'https://schema.org/OutOfStock';
}

function shippingDetailsFor(_pricePaise: number, facts: ShippingFacts | undefined) {
  if (!facts) return undefined;
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: '0.00', currency: 'INR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN', addressRegion: facts.freeStateCode },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: facts.dispatchDaysMin, maxValue: facts.dispatchDaysMax, unitCode: 'DAY' },
    },
  };
}

/**
 * The Product structured data Google reads for rich results (price, stock, stars, images).
 *
 * - One size/finish: a single Product with one Offer.
 * - Several sizes/finishes with the same price: one Product with an AggregateOffer.
 * - Several variants that differ by size, finish or material: a ProductGroup whose hasVariant lists each variant
 *   as its own Product (own SKU, own price, own stock). Only attributes that really differ are listed in variesBy.
 *
 * Everything here mirrors what the product page shows. Nothing is invented: no ratings or reviews unless the page
 * has them, no return policy (none is stored as data), no GTIN/MPN (custom products have none).
 */
export function buildProductJsonLd(input: {
  product: Pick<Product, 'title' | 'slug' | 'shortDesc' | 'primaryImageUrl' | 'ratingAverage' | 'ratingCount' | 'seo'> & { id?: string };
  variants: JsonLdVariant[];
  media: Pick<ProductMedia, 'type' | 'url'>[];
  reviews: Review[];
  categoryName?: string;
  shipping?: ShippingFacts;
  /** Overrides the description (the page's generated one) so the markup and the meta description agree. */
  description?: string;
  now?: Date;
}) {
  const { product, variants, media, reviews } = input;
  const seo = product.seo ?? {};
  const url = `${SITE_URL}/product/${product.slug}`;
  const images = [...new Set([product.primaryImageUrl, ...media.filter((m) => m.type === 'image').map((m) => m.url)].filter(Boolean))]
    .slice(0, 8)
    .map(absoluteUrl);
  const keywords = [seo.focusKeyword, ...(seo.keywords ?? [])].filter((k): k is string => Boolean(k && k.trim()));
  const productReviews = buildProductReviewsJsonLd(reviews);
  const seller = { '@type': 'Organization', name: 'KarthysGallery' };
  const description = input.description || seo.description || product.shortDesc;
  const prices = variants.map((v) => v.price / 100);

  const common = {
    '@context': 'https://schema.org',
    name: product.title,
    description,
    url,
    ...(images.length > 0 && { image: images }),
    brand: { '@type': 'Brand', name: 'KarthysGallery' },
    ...(input.categoryName && { category: input.categoryName }),
    ...(keywords.length > 0 && { keywords: keywords.join(', ') }),
    ...(product.ratingCount > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.ratingAverage, reviewCount: product.ratingCount } }),
    ...(productReviews.length > 0 && { review: productReviews }),
  };

  const offerFor = (v: JsonLdVariant) => ({
    '@type': 'Offer',
    url: v.id ? `${url}?variantId=${encodeURIComponent(v.id)}` : url,
    price: (v.price / 100).toFixed(2),
    priceCurrency: 'INR',
    itemCondition: 'https://schema.org/NewCondition',
    availability: availabilityOf(v.stockStatus),
    seller,
    ...(shippingDetailsFor(v.price, input.shipping) && { shippingDetails: shippingDetailsFor(v.price, input.shipping) }),
  });

  const distinct = (pick: (v: JsonLdVariant) => string | undefined) => new Set(variants.map((v) => pick(v) ?? '')).size > 1;
  const variesBySize = distinct((v) => v.sizeLabel);
  const variesByColour = distinct((v) => v.frameColour);
  const variesByMaterial = distinct((v) => v.material);
  const isGroup = variants.length > 1 && variants.every((v) => v.id) && (variesBySize || variesByColour || variesByMaterial);

  if (isGroup) {
    return {
      ...common,
      '@type': 'ProductGroup',
      productGroupID: product.id ?? product.slug,
      variesBy: [
        ...(variesBySize ? ['https://schema.org/size'] : []),
        ...(variesByColour ? ['https://schema.org/color'] : []),
        ...(variesByMaterial ? ['https://schema.org/material'] : []),
      ],
      hasVariant: variants.map((v) => ({
        '@type': 'Product',
        name: [product.title, [v.sizeLabel, v.frameColour].filter(Boolean).join(', ')].filter(Boolean).join(' — '),
        sku: v.sku,
        url: `${url}?variantId=${encodeURIComponent(v.id!)}`,
        ...(images.length > 0 && { image: images[0] }),
        ...(v.sizeLabel && { size: v.sizeLabel }),
        ...(v.frameColour && { color: v.frameColour }),
        ...(v.material && { material: v.material }),
        brand: { '@type': 'Brand', name: 'KarthysGallery' },
        offers: offerFor(v),
      })),
    };
  }

  const single = variants.length === 1 || (prices.length > 0 && Math.min(...prices) === Math.max(...prices));
  const inStock = variants.some((v) => v.stockStatus === 'in_stock');
  const availability = inStock ? 'https://schema.org/InStock' : variants.some((v) => v.stockStatus === 'backorder') ? 'https://schema.org/BackOrder' : 'https://schema.org/OutOfStock';
  return {
    ...common,
    '@type': 'Product',
    ...(variants[0]?.sku && { sku: variants[0].sku }),
    ...(prices.length > 0 && {
      offers: single
        ? offerFor(variants[0]!)
        : { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: prices.length, availability, url, seller },
    }),
  };
}
