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

  const selectedVariant = useMemo(
    () => variants.find((v) => v.sizeLabel === selectedSize && v.frameColour === selectedColour) ?? firstInStock,
    [variants, selectedSize, selectedColour, firstInStock]
  );

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
        onSelectSize={setSelectedSize}
        onSelectColour={setSelectedColour}
      />
    </div>
  );
}
