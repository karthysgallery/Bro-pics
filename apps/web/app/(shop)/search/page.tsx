import { searchProductsPage } from '../../../lib/firestore-products';
import { ProductCard } from '../../../components/product/ProductCard';

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
    <div className="px-4 py-8 md:px-8">
      <h1 className="font-display text-3xl mb-2">
        {query ? `Search results for "${query}"` : 'Search'}
      </h1>
      <p className="text-charcoal/70 mb-6">{totalCount} products</p>

      {products.length === 0 && query && (
        <p className="text-charcoal/70">No products found. Try a different search, or browse our best sellers.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
