import type { Product } from '@bro-pics/shared';
import { ProductRail } from '../home/ProductRail';

export function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return <ProductRail title="You May Also Like" products={products} />;
}
