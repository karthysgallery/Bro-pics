import Link from 'next/link';
import type { Product } from '@bro-pics/shared';

interface ProductCardProps {
  product: Product;
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link href={`/product/${product.slug}`} className="block rounded-lg overflow-hidden bg-surface group">
      <div className="relative aspect-square bg-cream">
        <img
          src={`/placeholders/products/${product.slug}-1.svg`}
          alt={product.title}
          className="w-full h-full object-cover group-hover:opacity-0 transition-opacity"
        />
        <img
          src={`/placeholders/products/${product.slug}-2.svg`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
        />
        {product.badges.length > 0 && (
          <span className="absolute top-2 left-2 bg-terracotta text-cream text-xs px-2 py-1 rounded-full">
            {product.badges[0]}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-charcoal/80 text-cream text-xs text-center py-1">
            Out of stock
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="inline-block text-xs text-sage mb-1">Customizable</span>
        <h3 className="font-display text-base">{product.title}</h3>
        <div className="flex items-center justify-between mt-1">
          <span className="font-medium">{formatPaise(product.minPrice)}</span>
          {product.ratingCount > 0 && (
            <span className="text-xs text-charcoal/70">
              ★ <span>{product.ratingAverage}</span> ({product.ratingCount})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
