import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface ProductRailProps {
  title?: string;
  products: Product[];
  viewAllHref?: string;
}

export function ProductRail({ title, products, viewAllHref }: ProductRailProps) {
  if (products.length === 0) return null;

  return (
    <Section space="tight">
      {title && <SectionHeader title={title} href={viewAllHref} />}
      <div className="rail flex gap-4 overflow-x-auto pb-1">
        {products.map((product) => (
          <div key={product.id} className="w-[46%] sm:w-52 shrink-0">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </Section>
  );
}
