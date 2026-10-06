import { describe, it, expect, vi } from 'vitest';

vi.mock('./media-public-url', () => ({
  buildPublicMediaUrl: vi.fn((path: string) => `https://storage.example.com/${path}`),
}));

import { buildBreadcrumbList, buildOrganizationJsonLd, buildProductReviewsJsonLd, resolveOgImage } from './structured-data';
import type { Review } from '@bro-pics/shared';

describe('buildBreadcrumbList', () => {
  it('[FE-41] builds a positioned ListItem per trail entry with absolute URLs', () => {
    const result = buildBreadcrumbList([
      { name: 'Home', path: '/' },
      { name: 'Frames', path: '/category/frames' },
      { name: 'Classic Wooden Frame', path: '/product/classic-wooden-frame' },
    ]);
    expect(result['@type']).toBe('BreadcrumbList');
    expect(result.itemListElement).toHaveLength(3);
    expect(result.itemListElement[0]).toMatchObject({ '@type': 'ListItem', position: 1, name: 'Home' });
    expect(result.itemListElement[2].position).toBe(3);
    expect(result.itemListElement[2].item.endsWith('/product/classic-wooden-frame')).toBe(true);
  });
});

describe('buildOrganizationJsonLd', () => {
  it('[FE-41] builds an Organization entity with a name and contact info', () => {
    const result = buildOrganizationJsonLd();
    expect(result['@type']).toBe('Organization');
    expect(result.name).toBe('KarthysGallery');
    expect(result.email).toBe('support@karthysgallery.in');
  });
});

describe('buildProductReviewsJsonLd', () => {
  const baseReview: Review = {
    id: 'r1',
    productId: 'p1',
    userId: 'u1',
    rating: 5,
    title: 'Great frame',
    body: 'Loved it',
    media: [],
    isVerified: true,
    status: 'approved',
    createdAt: new Date(),
  };

  it('[FE-41] includes only approved reviews', () => {
    const reviews: Review[] = [baseReview, { ...baseReview, id: 'r2', status: 'pending' }, { ...baseReview, id: 'r3', status: 'rejected' }];
    const result = buildProductReviewsJsonLd(reviews);
    expect(result).toHaveLength(1);
    expect(result[0]['@type']).toBe('Review');
    expect(result[0].reviewRating.ratingValue).toBe(5);
  });

  it('[FE-41] returns an empty array when there are no approved reviews', () => {
    expect(buildProductReviewsJsonLd([{ ...baseReview, status: 'pending' }])).toEqual([]);
  });
});

describe('[FE-42] resolveOgImage', () => {
  it("never overrides a real own image with the settings fallback", () => {
    expect(resolveOgImage('/products/frame.jpg', { ogImagePath: 'seo/og.jpg' })).toBe('/products/frame.jpg');
  });

  it('falls back to the resolved settings ogImagePath when there is no own image', () => {
    expect(resolveOgImage('', { ogImagePath: 'seo/og.jpg' })).toBe('https://storage.example.com/seo/og.jpg');
  });

  it('returns undefined when there is neither an own image nor a settings fallback', () => {
    expect(resolveOgImage('', null)).toBeUndefined();
    expect(resolveOgImage('', {})).toBeUndefined();
  });
});

import { buildProductJsonLd } from './structured-data';

describe('buildProductJsonLd', () => {
  const product = {
    title: 'Thalapathy Vijay Photo Frame',
    slug: 'vijay-photo-frame',
    shortDesc: 'A frame for every fan.',
    primaryImageUrl: '/p/vijay.jpg',
    ratingAverage: 4.8,
    ratingCount: 12,
    seo: { description: 'Buy a Vijay photo frame online.', focusKeyword: 'vijay photo frame', keywords: ['thalapathy frame'] },
  };

  it('gives Google brand, images, keywords, stars and a price range across sizes', () => {
    const ld = buildProductJsonLd({
      product,
      variants: [
        { sku: 'VJ-8', price: 79900, stockStatus: 'in_stock' },
        { sku: 'VJ-12', price: 129900, stockStatus: 'out_of_stock' },
      ],
      media: [{ type: 'image', url: 'https://cdn.example.com/2.jpg' }, { type: 'video', url: '/v.mp4' }],
      reviews: [],
      categoryName: 'Frames',
    });
    expect(ld).toMatchObject({
      '@type': 'Product',
      description: 'Buy a Vijay photo frame online.',
      sku: 'VJ-8',
      brand: { name: 'KarthysGallery' },
      category: 'Frames',
      keywords: 'vijay photo frame, thalapathy frame',
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
      offers: { '@type': 'AggregateOffer', lowPrice: '799.00', highPrice: '1299.00', offerCount: 2, availability: 'https://schema.org/InStock' },
    });
    expect((ld as { image: string[] }).image).toEqual([expect.stringMatching(/^https?:\/\/.+\/p\/vijay\.jpg$/), 'https://cdn.example.com/2.jpg']);
  });

  it('uses a single Offer with a validity date when there is one price', () => {
    const ld = buildProductJsonLd({ product, variants: [{ sku: 'VJ-8', price: 79900, stockStatus: 'in_stock' }], media: [], reviews: [], now: new Date('2026-10-06T00:00:00Z') });
    expect(ld.offers).toMatchObject({ '@type': 'Offer', price: '799.00', priceValidUntil: '2027-10-06', itemCondition: 'https://schema.org/NewCondition' });
  });
});
