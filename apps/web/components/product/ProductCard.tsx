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

  // What the customer most wants to know at a glance: how many photos it takes and how many sizes it comes in.
  const slots = product.photoSlots ?? 0;
  const sizeCount = product.availableSizes?.length ?? 0;
  const kindLabel = slots > 1 ? `${slots} photos` : slots === 1 ? 'Single photo' : 'Ready-made design';
  const metaLabel = sizeCount > 1 ? `${kindLabel} · ${sizeCount} sizes` : kindLabel;

  // The card shows the frame posed in a real setting (table or wall) when those photos exist; the other pose on hover.
  const cardImage = product.listingImageUrl || product.primaryImageUrl;
  const cardHover = product.listingImageUrl ? product.listingHoverImageUrl || null : product.hoverImageUrl;

  // Only real reviews are shown: a product with none has no rating line at all.
  const displayRating = product.ratingAverage;
  const displayRatingCount = product.ratingCount;

  return (
    <div className="group relative flex flex-col h-full">
      {/* Wishlist */}
      <WishlistButton productId={product.id} />

      <Link href={`/product/${product.slug}`} className="flex flex-col flex-1">

        {/* Image — clean square with minimal rounding */}
        <div className="relative aspect-square w-full rounded-card overflow-hidden bg-tint shrink-0 ring-1 ring-line/70 transition-shadow duration-300 group-hover:shadow-[0_14px_34px_-14px_rgb(78_57_32/0.35)]">
          {cardImage ? (
            <Image
              src={cardImage}
              alt={product.seo?.imageAlt || product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
                cardHover ? 'group-hover:opacity-0' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full bg-tint" />
          )}

          {cardHover && (
            <Image
              src={cardHover}
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
        <div className="pt-3.5 pb-1 flex flex-col flex-1">

          {/* Size / colour meta */}
          {metaLabel && (
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent/85 leading-none mb-2 truncate">
              {metaLabel}
            </p>
          )}

          {/* Title */}
          <h3 className="font-display text-[17px] sm:text-[19px] font-semibold text-ink leading-[1.2] line-clamp-2 mb-auto group-hover:text-accent transition-colors duration-140">
            {product.title}
          </h3>

          {/* Price and rating row */}
          <div className="flex items-baseline justify-between gap-2 mt-2.5">
            <span className="text-[15px] font-semibold text-ink tabular-nums">
              {priceLabel}
            </span>

            {displayRatingCount > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-gold" aria-hidden="true">
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
