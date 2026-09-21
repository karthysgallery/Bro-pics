import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface ProductGridProps {
  title: string;
  subtitle?: string;
  products: Product[];
  viewAllHref?: string;
}

// Five across on wide screens, four on desktop, two on phones — the density
// the reference runs at, and the reason the cards lost their borders.
export function ProductGrid({
  title,
  subtitle,
  products,
  viewAllHref = '/category/frames-wall-decor',
}: ProductGridProps) {
  if (products.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} subtitle={subtitle} href={viewAllHref} />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
        {products.slice(0, 10).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </Section>
  );
}
