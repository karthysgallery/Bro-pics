import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@bro-pics/shared';
import { RatingStars } from '../ui/RatingStars';
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

  return (
    // A white card on the field field, so the product sits in the page's
    // light rather than punching a hole in it. The lift on hover is the only
    // motion here and it answers the pointer, so it earns its place.
    <div className="group relative h-full flex flex-col rounded-2xl bg-paper border border-line overflow-hidden transition-shadow hover:shadow-lg hover:shadow-ink/5">
      <WishlistButton productId={product.id} />

      <Link href={`/product/${product.slug}`} className="flex flex-col flex-1">
        <div className="relative aspect-square bg-tint shrink-0">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className={`object-cover transition-opacity ${product.hoverImageUrl ? 'group-hover:opacity-0' : ''}`}
            />
          ) : (
            <div className="w-full h-full bg-tint" />
          )}
          {product.hoverImageUrl && (
            <Image
              src={product.hoverImageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
              className="object-cover opacity-0 group-hover:opacity-100 transition-opacity"
            />
          )}
          {product.badges.length > 0 && (
            <span className="absolute top-2.5 left-2.5 bg-gold text-ink text-2xs font-bold px-2 py-0.5 rounded-full">
              {product.badges[0]}
            </span>
          )}
          {!product.inStock && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/75 text-paper text-2xs text-center py-1">
              Out of stock
            </span>
          )}
        </div>

        <div className="p-3 flex flex-col gap-1">
          <h3 className="text-[13px] leading-snug text-ink line-clamp-2">{product.title}</h3>
          {product.ratingCount > 0 && (
            <span className="flex items-center gap-1 text-2xs text-ink/50">
              <RatingStars rating={product.ratingAverage} size={12} />
              <span>{product.ratingAverage}</span>
              <span>({product.ratingCount})</span>
            </span>
          )}
          <span className="text-base font-semibold text-ink">{priceLabel}</span>
        </div>
      </Link>
    </div>
  );
}
