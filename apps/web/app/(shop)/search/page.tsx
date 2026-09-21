import type { Metadata } from 'next';
import { searchProductsPage } from '../../../lib/firestore-products';
import { ProductCard } from '../../../components/product/ProductCard';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q ?? '';
  const { products, totalCount } = query
    ? await searchProductsPage(query, {}, 1)
    : { products: [], totalCount: 0 };

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">
        {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Search'}
      </h1>
      <p className="mt-1 mb-5 text-sm text-ink/60">
        {query ? `${totalCount} products` : 'Type in the search bar above to find a frame.'}
      </p>

      {products.length === 0 && query && (
        <div className="py-8">
          <p className="text-sm text-ink/70">Nothing matched that search.</p>
          <a href="/category" className="mt-2 inline-block text-sm font-medium text-accent hover:text-accent-dark">
            Browse all collections <span aria-hidden="true">&rsaquo;</span>
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
