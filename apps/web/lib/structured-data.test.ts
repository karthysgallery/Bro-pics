import { describe, it, expect } from 'vitest';
import { buildBreadcrumbList, buildOrganizationJsonLd, buildProductReviewsJsonLd } from './structured-data';
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
    expect(result.name).toBe('BroPics');
    expect(result.email).toBe('support@bropics.in');
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
