import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import { AuthProvider } from '../../lib/auth-context';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}

const product = {
  id: 'prod_1', title: 'Classic Wooden Photo Frame', slug: 'classic-wooden-frame', categoryId: 'cat_frames',
  shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '',
  basePrice: 79900, isActive: true, isFeatured: false, badges: [], dispatchDaysMin: 3, dispatchDaysMax: 5,
  photoSlots: 1, allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
  availableSizes: ['8x12 in', '12x18 in'], availableColours: ['Black', 'White'], availableMaterials: ['Wood'],
  minPrice: 79900, maxPrice: 99900, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '/generic.svg', hoverImageUrl: null,
} satisfies Product;

// Real seed-data shape from prod_classic_wooden_frame (see Finding 1): sizes and
// colours don't form a full cross-product — 12x18 only exists in Black, so
// (12x18, White) has no matching variant.
const variants: Variant[] = [
  { id: 'v_black', productId: 'prod_1', sku: 'A', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'Black', material: 'Wood', price: 79900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
  { id: 'v_white', productId: 'prod_1', sku: 'B', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'White', material: 'Wood', price: 84900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
  { id: 'v_black_12x18', productId: 'prod_1', sku: 'C', sizeLabel: '12x18 in', widthIn: 12, heightIn: 18, frameColour: 'Black', material: 'Wood', price: 99900, stockStatus: 'in_stock', printWidthPx: 3600, printHeightPx: 5400, minUploadPx: 3600, aspectRatio: 0.67, isActive: true },
];

const media: ProductMedia[] = [
  { id: 'm_generic', productId: 'prod_1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0 },
  { id: 'm_black', productId: 'prod_1', variantId: 'v_black', type: 'image', url: '/black.svg', alt: '', sortOrder: 0 },
];

describe('ProductDetailClient', () => {
  it('shows the default variant (first in stock, 8x12/Black) with its dedicated media and price', () => {
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} /></Providers>);
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/black.svg');
  });

  it('falls back to variant-agnostic media when transitioning into a colour with no dedicated photos', () => {
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} /></Providers>);
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849.00')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/generic.svg');
  });

  it('never offers a size×colour combination with no matching variant, and every reachable click resolves to a real variant', () => {
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} /></Providers>);

    // Default: 8x12 / Black. Both sizes are selectable here (Black pairs with both).
    expect(screen.getByRole('button', { name: '12x18 in' })).toBeInTheDocument();

    // Switch colour to White — White only pairs with 8x12, so 12x18 must no
    // longer be offered as a size option (this is the impossible combination
    // from the finding: 12x18 + White has no matching variant).
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '12x18 in' })).not.toBeInTheDocument();

    // Switch colour back to Black — 12x18 becomes selectable again.
    fireEvent.click(screen.getByRole('button', { name: 'Black' }));
    expect(screen.getByRole('button', { name: '12x18 in' })).toBeInTheDocument();

    // Selecting 12x18 (only ever valid alongside Black) resolves to the real
    // 12x18/Black variant — price and media reflect that exact variant, not a
    // silently mismatched fallback — and White must no longer be offered as a
    // colour option, since 12x18 has no White variant.
    fireEvent.click(screen.getByRole('button', { name: '12x18 in' }));
    expect(screen.getByText('₹999.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'White' })).not.toBeInTheDocument();
  });
});
