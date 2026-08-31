import type { Product } from '@bro-pics/shared';

export function ProductTabs({ product }: { product: Product }) {
  return <div>{product.descriptionHtml}</div>;
}
