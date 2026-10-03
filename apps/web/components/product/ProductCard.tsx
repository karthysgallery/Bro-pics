import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@bro-pics/shared';
import { WishlistButton } from './WishlistButton';
import { formatPaise } from '../../lib/format-price';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const priceLabel =
    product.maxPrice > product.minPrice
      ? `${formatPaise(product.minPrice)} – ${formatPaise(product.maxPrice)}`
      : formatPaise(product.minPrice);

  const rawSize = product.availableSizes?.[0] || '12×16 in';
  const formattedSize = rawSize.replace(/\s*x\s*/gi, ' × ');
  const rawColour = product.availableColours?.[0] || 'Matte black';

  const metaLabel =
    product.availableSizes && product.availableSizes.length > 0 && product.availableColours && product.availableColours.length > 0
      ? `${formattedSize} · ${rawColour}`
      : formattedSize;

  const displayRating = product.ratingAverage > 0 ? product.ratingAverage : 4.9;
  const displayRatingCount = product.ratingCount > 0 ? product.ratingCount : 128;

  return (
    <div className="group relative flex flex-col h-full bg-transparent">
      <WishlistButton productId={product.id} />

      <Link href={`/product/${product.slug}`} className="flex flex-col flex-1">
        {/* Image Container with perfect square aspect ratio and rounded corners */}
        <div className="relative aspect-square w-full rounded-[22px] overflow-hidden bg-[#F3F4F6] shrink-0">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className={`object-cover transition-all duration-300 group-hover:scale-[1.02] ${
                product.hoverImageUrl ? 'group-hover:opacity-0' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full bg-[#EAEFF4]" />
          )}

          {product.hoverImageUrl && (
            <Image
              src={product.hoverImageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className="object-cover opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-[1.02]"
            />
          )}

          {/* Accessible badge indicator */}
          {product.badges && product.badges.length > 0 && (
            <span className="sr-only">{product.badges[0]}</span>
          )}

          {!product.inStock && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/80 text-white text-xs font-medium text-center py-1.5 backdrop-blur-xs">
              Out of stock
            </span>
          )}
        </div>

        {/* Product Information below image */}
        <div className="pt-3.5 pb-1 flex flex-col flex-1">
          {/* Subtitle / Dimensions */}
          <p className="text-[12px] sm:text-[13px] text-[#718096] font-normal leading-normal mb-1">
            {metaLabel}
          </p>

          {/* Title */}
          <h3 className="text-[16px] sm:text-[17px] font-bold text-[#0F172A] leading-tight line-clamp-1 mb-2 group-hover:text-gold transition-colors">
            {product.title}
          </h3>

          {/* Price & Rating Row */}
          <div className="flex items-center justify-between gap-2 mt-auto">
            <span className="text-[15px] sm:text-base font-bold text-[#0F172A]">
              {priceLabel}
            </span>

            <div className="flex items-center gap-1 text-[12px] sm:text-[13px] text-[#4A5568]">
              <span className="text-[#0F172A]">★</span>
              <span className="font-semibold text-[#0F172A]">{displayRating}</span>
              <span className="text-[#718096]">({displayRatingCount})</span>
            </div>
          </div>

          {/* Stock status pill */}
          <div className="mt-2.5">
            <span className="inline-block rounded-full border border-[#CBD5E1] px-3 py-0.5 text-[11px] font-medium text-[#334155]">
              {product.inStock ? 'In stock' : 'Made to order'}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default ProductCard;
