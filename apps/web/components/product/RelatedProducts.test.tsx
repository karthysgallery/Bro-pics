import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedProducts } from './RelatedProducts';
import type { Product } from '@bro-pics/shared';

const makeProduct = (id: string): Product => ({
  id, title: `Product ${id}`, slug: id, categoryId: 'cat_frames', shortDesc: '', descriptionHtml: '',
  highlights: [], howItWorks: [], careText: '', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '', hoverImageUrl: null,
});

describe('RelatedProducts', () => {
  it('renders nothing when there are no related products', () => {
    const { container } = render(<RelatedProducts products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a rail titled "You May Also Like" with each product', () => {
    render(<RelatedProducts products={[makeProduct('a'), makeProduct('b')]} />);
    expect(screen.getByText('You May Also Like')).toBeInTheDocument();
    expect(screen.getByText('Product a')).toBeInTheDocument();
    expect(screen.getByText('Product b')).toBeInTheDocument();
  });
});
