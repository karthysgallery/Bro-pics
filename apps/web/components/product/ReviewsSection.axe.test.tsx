import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ReviewsSection } from './ReviewsSection';
import type { Product, Review } from '@bro-pics/shared';

vi.mock('../../lib/auth-context', () => ({ useAuth: () => ({ user: null, loading: false }) }));

const product: Product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: '', descriptionHtml: '',
  highlights: [], howItWorks: [], careText: '', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 4.5, ratingCount: 2,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '', hoverImageUrl: null,
};

const reviews: Review[] = [
  {
    id: 'r1', productId: 'p1', userId: 'u1', rating: 5, title: 'Great', body: 'Loved it',
    media: ['reviews/p1/r1/photo.jpg'], isVerified: true, status: 'approved', createdAt: new Date('2026-02-01'),
  },
];

describe('[FE-44] ReviewsSection accessibility', () => {
  it('has no axe violations with a photo review and the "with photos" filter shown', async () => {
    const { container } = render(<ReviewsSection product={product} reviews={reviews} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
