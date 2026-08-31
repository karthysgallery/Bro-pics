import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductRail } from './ProductRail';
import type { Product } from '@bro-pics/shared';

function makeProduct(id: string, title: string): Product {
  return {
    id,
    title,
    slug: id,
    categoryId: 'cat_frames',
    shortDesc: '',
    descriptionHtml: '',
    highlights: [],
    howItWorks: [],
    careText: '',
    basePrice: 10000,
    isActive: true,
    isFeatured: false,
    badges: [],
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: 1,
    allowsTextPersonalization: false,
    seo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    availableSizes: [],
    availableColours: [],
    availableMaterials: [],
    minPrice: 10000,
    maxPrice: 10000,
    occasionTags: [],
    inStock: true,
    ratingAverage: 0,
    ratingCount: 0,
    titleLower: title.toLowerCase(),
    searchTokens: [],
    primaryImageUrl: `/placeholders/products/${id}-1.svg`,
    hoverImageUrl: null,
  };
}

describe('ProductRail', () => {
  it('renders a heading and every product card', () => {
    const products = [makeProduct('p1', 'Frame One'), makeProduct('p2', 'Frame Two')];
    render(<ProductRail title="Best Sellers" products={products} />);
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();
    expect(screen.getByText('Frame One')).toBeInTheDocument();
    expect(screen.getByText('Frame Two')).toBeInTheDocument();
  });

  it('renders nothing extra when the product list is empty', () => {
    render(<ProductRail title="Best Sellers" products={[]} />);
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
