import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ProductCard } from './ProductCard';
import type { Product } from '@bro-pics/shared';

const product: Product = {
  id: 'p1', title: 'Classic Wooden Frame', slug: 'classic-wooden-frame', categoryId: 'cat_frames',
  shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '', basePrice: 79900,
  isActive: true, isFeatured: false, badges: ['Bestseller'], dispatchDaysMin: 3, dispatchDaysMax: 5,
  photoSlots: 1, allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
  availableSizes: [], availableColours: [], availableMaterials: [], minPrice: 79900, maxPrice: 99900,
  occasionTags: [], inStock: true, ratingAverage: 4.5, ratingCount: 12, titleLower: '', searchTokens: [],
  faq: [], primaryImageUrl: '/generic.svg', hoverImageUrl: '/hover.svg',
};

describe('[FE-44] ProductCard accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<ProductCard product={product} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
