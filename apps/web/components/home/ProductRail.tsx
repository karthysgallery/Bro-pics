import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';

interface ProductRailProps {
  title: string;
  products: Product[];
}

export function ProductRail({ title, products }: ProductRailProps) {
  return (
    <section className="px-4 py-10 md:px-8">
      <h2 className="font-display text-2xl mb-6">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {products.map((product) => (
          <div key={product.id} className="w-48 flex-shrink-0">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
