'use client';

import { useState, useMemo } from 'react';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';
import { selectGalleryMedia } from '../../lib/gallery-media';
import { Gallery } from './Gallery';
import { BuyBox } from './BuyBox';

interface ProductDetailClientProps {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
}

export function ProductDetailClient({ product, variants, media }: ProductDetailClientProps) {
  const firstInStock = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;
  const [selectedSize, setSelectedSize] = useState(firstInStock?.sizeLabel ?? '');
  const [selectedColour, setSelectedColour] = useState(firstInStock?.frameColour ?? '');

  // Only the initial-load fallback (before the user has clicked anything).
  // Once the user interacts, handleSelectSize/handleSelectColour below keep
  // selectedSize/selectedColour pinned to a combination that actually has a
  // matching variant, so this exact find() should always succeed post-interaction.
  const selectedVariant = useMemo(
    () => variants.find((v) => v.sizeLabel === selectedSize && v.frameColour === selectedColour) ?? firstInStock,
    [variants, selectedSize, selectedColour, firstInStock]
  );

  // If the requested size doesn't pair with the currently-selected colour,
  // jump to the first variant of that size and adopt its colour too, so the
  // resulting (size, colour) pair always corresponds to a real variant.
  const handleSelectSize = (size: string) => {
    const matching = variants.find((v) => v.sizeLabel === size && v.frameColour === selectedColour);
    if (matching) {
      setSelectedSize(size);
      return;
    }
    const fallback = variants.find((v) => v.sizeLabel === size);
    if (fallback) {
      setSelectedSize(fallback.sizeLabel);
      setSelectedColour(fallback.frameColour);
    }
  };

  // Symmetric to handleSelectSize: if the requested colour doesn't pair with
  // the currently-selected size, jump to the first variant of that colour.
  const handleSelectColour = (colour: string) => {
    const matching = variants.find((v) => v.frameColour === colour && v.sizeLabel === selectedSize);
    if (matching) {
      setSelectedColour(colour);
      return;
    }
    const fallback = variants.find((v) => v.frameColour === colour);
    if (fallback) {
      setSelectedColour(fallback.frameColour);
      setSelectedSize(fallback.sizeLabel);
    }
  };

  const galleryMedia = useMemo(
    () => selectGalleryMedia(media, selectedVariant?.id ?? null),
    [media, selectedVariant]
  );

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Gallery media={galleryMedia} productTitle={product.title} />
      <BuyBox
        product={product}
        variants={variants}
        selectedVariant={selectedVariant}
        selectedSize={selectedSize}
        selectedColour={selectedColour}
        onSelectSize={handleSelectSize}
        onSelectColour={handleSelectColour}
      />
    </div>
  );
}
