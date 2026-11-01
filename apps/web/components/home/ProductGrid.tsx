'use client';

import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface ProductGridProps {
  title?: string;
  subtitle?: string;
  products: Product[];
  viewAllHref?: string;
}

export function ProductGrid({
  title = "Meet your wall's next favourite.",
  subtitle,
  products,
  viewAllHref = '/category',
}: ProductGridProps) {
  if (products.length === 0) return null;

  return (
    <Section>
      <div className="flex flex-col">

        <SectionHeader eyebrow="A frame for every feeling" title={title} subtitle={subtitle} href={viewAllHref} linkLabel="Shop all frames" />

        {/* Product grid — 2 cols mobile, 4 cols desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </Section>
  );
}

export default ProductGrid;
