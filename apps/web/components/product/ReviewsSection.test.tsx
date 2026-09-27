import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewsSection } from './ReviewsSection';
import type { Product, Review } from '@bro-pics/shared';

vi.mock('../../lib/auth-context', () => ({ useAuth: () => ({ user: null, loading: false }) }));

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

  it('[FE-32] shows no "with photos" filter when no review has a photo', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    expect(screen.queryByText(/With photos only/)).not.toBeInTheDocument();
  });

  it('[FE-32] filters to only reviews with photos when the checkbox is checked, and shows a thumbnail', () => {
    const reviewsWithPhoto: Review[] = [
      ...reviews,
      {
        id: 'r3',
        productId: 'p1',
        userId: 'u3',
        rating: 5,
        title: 'With a photo',
        body: 'See attached',
        media: ['reviews/p1/r3/photo.jpg'],
        isVerified: false,
        status: 'approved',
        createdAt: new Date('2026-03-01'),
      },
    ];
    render(<ReviewsSection product={product} reviews={reviewsWithPhoto} />);
    expect(screen.getByText('With photos only (1)')).toBeInTheDocument();
    expect(screen.getAllByTestId('review-title')).toHaveLength(3);

    fireEvent.click(screen.getByLabelText(/With photos only/));
    expect(screen.getAllByTestId('review-title')).toHaveLength(1);
    expect(screen.getByTestId('review-title').textContent).toBe('With a photo');
  });
});
