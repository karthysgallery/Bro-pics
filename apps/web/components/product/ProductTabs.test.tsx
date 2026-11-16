import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductTabs } from './ProductTabs';
import type { Product, Variant } from '@bro-pics/shared';

vi.mock('../../lib/auth-context', () => ({ useAuth: () => ({ user: null, loading: false }) }));

const product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: 'A lovely frame.',
  descriptionHtml: '<p>A lovely frame.</p>', highlights: ['Solid wood'], howItWorks: ['Upload your photo'],
  careText: 'Wipe with a dry cloth.', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [],
  faq: [{ question: 'Does it come framed?', answer: 'Yes, ready to hang.' }],
  primaryImageUrl: '', hoverImageUrl: null,
} satisfies Product;

describe('ProductTabs', () => {
  const variants = [
    {
      id: 'v1', productId: 'p1', sku: 'SKU-1', sizeLabel: '8x10 in', widthIn: 8, heightIn: 10,
      frameColour: 'Black', material: 'Wood', price: 79900, stockStatus: 'in_stock',
      printWidthPx: 2400, printHeightPx: 3000, minUploadPx: 2400, aspectRatio: 0.8, isActive: true,
    } satisfies Variant,
  ];

  it('shows a short description with bullet highlights and what you get, not paragraphs', () => {
    render(<ProductTabs product={product} variants={variants} />);
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('A lovely frame.')).toBeInTheDocument();
    expect(screen.getByText('Solid wood')).toBeInTheDocument();
    expect(screen.getByText(/8 mm MDF/)).toBeInTheDocument();
    expect(screen.getAllByText('8x10 in').length).toBeGreaterThan(0);
    expect(screen.getByText('3–5 working days')).toBeInTheDocument();
  });

  it('has a Reviews tab when reviews are given', () => {
    render(<ProductTabs product={product} reviews={[]} />);
    fireEvent.click(screen.getByRole('tab', { name: /Reviews/ }));
    expect(screen.getByRole('tab', { name: /Reviews/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/be the first/i)).toBeInTheDocument();
  });

  it('keeps FAQ, size chart, care and shipping folded underneath', () => {
    render(<ProductTabs product={product} variants={variants} />);
    expect(screen.getByText('Does it come framed?')).toBeInTheDocument();
    expect(screen.getByText('8 × 10 in')).toBeInTheDocument();
    expect(screen.getByText('Wipe with a dry cloth.')).toBeInTheDocument();
    expect(screen.getByText(/dispatches in 3-5 days/i)).toBeInTheDocument();
  });
});
