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

  it('uses a single Offer when there is one price (and invents no validity date)', () => {
    const ld = buildProductJsonLd({ product, variants: [{ sku: 'VJ-8', price: 79900, stockStatus: 'in_stock' }], media: [], reviews: [] }) as { offers: Record<string, unknown> };
    expect(ld.offers).toMatchObject({ '@type': 'Offer', price: '799.00', priceCurrency: 'INR', itemCondition: 'https://schema.org/NewCondition', availability: 'https://schema.org/InStock' });
    expect(ld.offers).not.toHaveProperty('priceValidUntil');
  });

  const sizes = [
    { id: 'v1', sku: 'VJ-8-BLK', price: 79900, stockStatus: 'in_stock', sizeLabel: '8x12 in', frameColour: 'Black' },
    { id: 'v2', sku: 'VJ-8-WHT', price: 79900, stockStatus: 'out_of_stock', sizeLabel: '8x12 in', frameColour: 'White' },
    { id: 'v3', sku: 'VJ-12-BLK', price: 129900, stockStatus: 'backorder', sizeLabel: '12x18 in', frameColour: 'Black' },
  ];

  it('describes sizes and finishes as a ProductGroup with each variant identifiable, priced and stocked on its own', () => {
    const ld = buildProductJsonLd({ product: { ...product, id: 'prod_vj' }, variants: sizes, media: [], reviews: [] }) as {
      '@type': string; productGroupID: string; variesBy: string[]; hasVariant: Array<Record<string, any>>;
    };
    expect(ld['@type']).toBe('ProductGroup');
    expect(ld.productGroupID).toBe('prod_vj');
    expect(ld.variesBy).toEqual(['https://schema.org/size', 'https://schema.org/color']);
    expect(ld.hasVariant.map((v) => [v.sku, v.size, v.color, v.offers.price, v.offers.availability])).toEqual([
      ['VJ-8-BLK', '8x12 in', 'Black', '799.00', 'https://schema.org/InStock'],
      ['VJ-8-WHT', '8x12 in', 'White', '799.00', 'https://schema.org/OutOfStock'],
      ['VJ-12-BLK', '12x18 in', 'Black', '1299.00', 'https://schema.org/BackOrder'],
    ]);
    expect(ld.hasVariant[0]!.url).toBe('https://karthysgallery.in/product/vijay-photo-frame?variantId=v1');
    expect(ld.hasVariant[0]!.name).toBe('Thalapathy Vijay Photo Frame — 8x12 in, Black');
  });

  it('lists only the attributes that actually differ in variesBy', () => {
    const onlyColour = sizes.filter((v) => v.sizeLabel === '8x12 in');
    const ld = buildProductJsonLd({ product, variants: onlyColour, media: [], reviews: [] }) as { variesBy: string[] };
    expect(ld.variesBy).toEqual(['https://schema.org/color']);
  });

  it('adds shipping details from real settings: free at or above the threshold, the flat charge below, handling time from the product', () => {
    const ld = buildProductJsonLd({
      product, variants: sizes, media: [], reviews: [],
      shipping: { freeShippingThreshold: 100000, flatShippingCharge: 5000, dispatchDaysMin: 3, dispatchDaysMax: 5 },
    }) as { hasVariant: Array<Record<string, any>> };
    const rate = (i: number) => hasShipping(ld.hasVariant[i]!.offers.shippingDetails);
    function hasShipping(d: any) { return d.shippingRate.value; }
    expect(rate(0)).toBe('50.00');
    expect(rate(2)).toBe('0.00');
    expect(ld.hasVariant[0]!.offers.shippingDetails).toMatchObject({
      shippingDestination: { addressCountry: 'IN' },
      deliveryTime: { handlingTime: { minValue: 3, maxValue: 5, unitCode: 'DAY' } },
    });
  });

  it('never outputs a return policy, rating or review it has no data for', () => {
    const ld = buildProductJsonLd({ product: { ...product, ratingCount: 0, ratingAverage: 0 }, variants: sizes, media: [], reviews: [] });
    expect(JSON.stringify(ld)).not.toMatch(/MerchantReturnPolicy|aggregateRating|"review"/);
  });
});
