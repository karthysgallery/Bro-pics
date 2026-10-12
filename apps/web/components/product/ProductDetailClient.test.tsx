import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

// CartProvider no longer hard-requires an AuthProvider ancestor — it reads
// auth state via AuthContext directly with a null-safe fallback, treating
// "no AuthProvider" the same as "signed out". No auth mocking needed here.
const Providers = CartProvider;

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
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} initialTemplatesByVariant={{}} /></Providers>);
    expect(screen.getByText('₹799')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/black.svg');
  });

  it('falls back to variant-agnostic media when transitioning into a colour with no dedicated photos', () => {
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} initialTemplatesByVariant={{}} /></Providers>);
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/generic.svg');
  });

  it('lists every size, and a click on a size the chosen frame does not come in moves to a frame that has it', () => {
    render(<Providers><ProductDetailClient product={product} variants={variants} media={media} initialTemplatesByVariant={{}} /></Providers>);

    // Default: 8x12 / Black.
    expect(screen.getByRole('button', { name: '12x18 in' })).toBeInTheDocument();

    // White only comes in 8x12, but 12x18 stays on the list: a size sold in one frame must not vanish.
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12x18 in' })).toBeInTheDocument();

    // Choosing it moves to the frame that has it (Black); price reflects that exact variant and White is no longer offered.
    fireEvent.click(screen.getByRole('button', { name: '12x18 in' }));
    expect(screen.getByText('₹999')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'White' })).not.toBeInTheDocument();
  });

  it('[FE-32] distinguishes a backorder variant from a truly out-of-stock one, rather than showing "Out of stock" for both', () => {
    const backorderVariants: Variant[] = [{ ...variants[0], stockStatus: 'backorder' }];
    render(
      <Providers>
        <ProductDetailClient product={product} variants={backorderVariants} media={media} initialTemplatesByVariant={{}} />
      </Providers>
    );
    expect(screen.getByText(/On backorder/)).toBeInTheDocument();
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
  });

  it('[FE-32] still shows "Out of stock" (not backorder wording) for a genuinely out-of-stock variant', () => {
    const outOfStockVariants: Variant[] = [{ ...variants[0], stockStatus: 'out_of_stock' }];
    render(
      <Providers>
        <ProductDetailClient product={product} variants={outOfStockVariants} media={media} initialTemplatesByVariant={{}} />
      </Providers>
    );
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.queryByText(/On backorder/)).not.toBeInTheDocument();
  });
});
