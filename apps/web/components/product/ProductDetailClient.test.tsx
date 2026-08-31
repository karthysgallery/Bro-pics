import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

const product = {
  id: 'prod_1', title: 'Classic Wooden Photo Frame', slug: 'classic-wooden-frame', categoryId: 'cat_frames',
  shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '',
  basePrice: 79900, isActive: true, isFeatured: false, badges: [], dispatchDaysMin: 3, dispatchDaysMax: 5,
  photoSlots: 1, allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
  availableSizes: ['8x12 in'], availableColours: ['Black', 'White'], availableMaterials: ['Wood'],
  minPrice: 79900, maxPrice: 79900, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '/generic.svg', hoverImageUrl: null,
} satisfies Product;

const variants: Variant[] = [
  { id: 'v_black', productId: 'prod_1', sku: 'A', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'Black', material: 'Wood', price: 79900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
  { id: 'v_white', productId: 'prod_1', sku: 'B', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'White', material: 'Wood', price: 84900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
];

const media: ProductMedia[] = [
  { id: 'm_generic', productId: 'prod_1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0 },
  { id: 'm_black', productId: 'prod_1', variantId: 'v_black', type: 'image', url: '/black.svg', alt: '', sortOrder: 0 },
];

describe('ProductDetailClient', () => {
  it('shows the default variant (first in stock) media and price', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/black.svg');
  });

  it('switches to variant-specific media and price when a colour is selected', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Black' }));
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/black.svg');
  });

  it('falls back to variant-agnostic media for a variant with no dedicated photos', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849.00')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/generic.svg');
  });
});
