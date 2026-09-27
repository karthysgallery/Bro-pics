import type { Product } from '@bro-pics/shared';
import { ProductRail } from '../home/ProductRail';

export function RelatedProducts({ products, title = 'You May Also Like' }: { products: Product[]; title?: string }) {
  if (products.length === 0) return null;
  return <ProductRail title={title} products={products} />;
}
