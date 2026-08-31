import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductTabs } from './ProductTabs';
import type { Product } from '@bro-pics/shared';

const product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: '',
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
  it('shows the description tab by default', () => {
    render(<ProductTabs product={product} />);
    expect(screen.getByText('A lovely frame.')).toBeInTheDocument();
  });

  it('switches to the FAQ tab and shows its content', () => {
    render(<ProductTabs product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    expect(screen.getByText('Does it come framed?')).toBeInTheDocument();
  });

  it('switches to the Picture Quality Guide tab', () => {
    render(<ProductTabs product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'Picture Quality Guide' }));
    expect(screen.getByText(/resolution/i)).toBeInTheDocument();
  });
});
