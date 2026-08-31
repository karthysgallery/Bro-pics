import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

interface ProductDetailClientProps {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  return <h1 className="font-display text-3xl">{product.title}</h1>;
}
