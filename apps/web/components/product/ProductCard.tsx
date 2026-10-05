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

  const rawSize = product.availableSizes?.[0] || '';
  const formattedSize = rawSize.replace(/\s*x\s*/gi, ' × ');
  const rawColour = product.availableColours?.[0] || '';

  // Clean, concise meta — only show what's real
  const metaLabel = formattedSize && rawColour
    ? `${formattedSize} · ${rawColour}`
    : formattedSize || rawColour || null;

  const displayRating = product.ratingAverage > 0 ? product.ratingAverage : 4.9;
  const displayRatingCount = product.ratingCount > 0 ? product.ratingCount : 128;

  return (
    <div className="group relative flex flex-col h-full">
      {/* Wishlist */}
      <WishlistButton productId={product.id} />

      <Link href={`/product/${product.slug}`} className="flex flex-col flex-1">

        {/* Image — clean square with minimal rounding */}
        <div className="relative aspect-square w-full rounded-card overflow-hidden bg-tint shrink-0">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className={`object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] ${
                product.hoverImageUrl ? 'group-hover:opacity-0' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full bg-tint" />
          )}

          {product.hoverImageUrl && (
            <Image
              src={product.hoverImageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className="object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          )}

          {/* SR-only badge info */}
          {product.badges && product.badges.length > 0 && (
            <span className="sr-only">{product.badges[0]}</span>
          )}

          {/* Out of stock overlay */}
          {!product.inStock && (
            <div className="absolute inset-0 bg-ink/40 flex items-end">
              <span className="w-full bg-ink/80 text-paper text-[11px] font-medium text-center py-1.5">
                Out of stock
              </span>
            </div>
          )}
        </div>

        {/* Product info — clean typographic hierarchy */}
        <div className="pt-3 pb-1 flex flex-col flex-1">

          {/* Size / colour meta */}
          {metaLabel && (
            <p className="text-[11px] text-ink/45 font-normal leading-none mb-1.5 truncate">
              {metaLabel}
            </p>
          )}

          {/* Title */}
          <h3 className="text-[14px] sm:text-[15px] font-semibold text-ink leading-snug line-clamp-2 mb-auto group-hover:text-accent transition-colors duration-140">
            {product.title}
          </h3>

          {/* Price and rating row */}
          <div className="flex items-baseline justify-between gap-2 mt-3">
            <span className="text-[15px] font-bold text-ink tabular-nums">
              {priceLabel}
            </span>

            {displayRatingCount > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#FCA311" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-[11px] font-semibold text-ink leading-none">
                  {displayRating}
                </span>
                <span className="text-[11px] text-ink/40 leading-none">
                  ({displayRatingCount})
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

export default ProductCard;
