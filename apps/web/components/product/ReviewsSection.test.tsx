import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewsSection } from './ReviewsSection';
import type { Product, Review } from '@bro-pics/shared';

const product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: '', descriptionHtml: '',
  highlights: [], howItWorks: [], careText: '', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 4.5, ratingCount: 2,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '', hoverImageUrl: null,
} satisfies Product;

const reviews: Review[] = [
  { id: 'r2', productId: 'p1', userId: 'u2', rating: 4, title: 'Good', body: 'Nice quality', media: [], isVerified: false, status: 'approved', createdAt: new Date('2026-01-01') },
  { id: 'r1', productId: 'p1', userId: 'u1', rating: 5, title: 'Great', body: 'Loved it', media: [], isVerified: true, status: 'approved', createdAt: new Date('2026-02-01') },
];

describe('ReviewsSection', () => {
  it('shows the rating average and count', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('(2 reviews)')).toBeInTheDocument();
  });

  it('lists reviews with the most recent first', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    const titles = screen.getAllByTestId('review-title').map((el) => el.textContent);
    expect(titles).toEqual(['Great', 'Good']);
  });

  it('shows a rating breakdown bar for each star level', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    expect(screen.getAllByTestId('rating-breakdown-row')).toHaveLength(5);
  });

  it('shows an empty state when there are no reviews', () => {
    render(<ReviewsSection product={{ ...product, ratingCount: 0 }} reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });
});
