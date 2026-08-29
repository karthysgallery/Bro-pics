import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Product } from '@bro-pics/shared';

const product: Product = {
  id: 'prod_1',
  title: 'Classic Wooden Photo Frame',
  slug: 'classic-wooden-photo-frame',
  categoryId: 'cat_frames',
  shortDesc: 'A timeless wooden frame',
  descriptionHtml: '',
  highlights: [],
  howItWorks: [],
  careText: '',
  basePrice: 79900,
  isActive: true,
  isFeatured: true,
  badges: ['best-seller'],
  dispatchDaysMin: 3,
  dispatchDaysMax: 5,
  photoSlots: 1,
  allowsTextPersonalization: false,
  seo: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  availableSizes: ['8x12 in'],
  availableColours: ['Black'],
  availableMaterials: ['Wood'],
  minPrice: 79900,
  maxPrice: 79900,
  occasionTags: [],
  inStock: true,
  ratingAverage: 4.5,
  ratingCount: 12,
  titleLower: 'classic wooden photo frame',
  searchTokens: [],
};

describe('ProductCard', () => {
  it('renders the title, price, and rating', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('Classic Wooden Photo Frame')).toBeInTheDocument();
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('shows a "Customizable" tag', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('Customizable')).toBeInTheDocument();
  });

  it('renders the best-seller badge when present', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('best-seller')).toBeInTheDocument();
  });

  it('links to the product detail page by slug', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/product/classic-wooden-photo-frame');
  });

  it('shows an out-of-stock label when inStock is false', () => {
    render(<ProductCard product={{ ...product, inStock: false }} />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });
});
