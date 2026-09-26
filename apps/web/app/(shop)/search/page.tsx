import type { Metadata } from 'next';
import { searchProductsPage, searchCategoriesPage } from '../../../lib/firestore-products';
import { ProductCard } from '../../../components/product/ProductCard';
import { parseSearchFilters } from '@bro-pics/shared';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  return params;
}

// [BE-23] Was previously hardcoding filters: {} and page 1, silently
// dropping every filter/sort/page URL param even though
// parseSearchFilters (shared with the category page) already parses
// them — a search results link with ?sort=price_asc or a page-2 link
// simply did nothing. Now wired the same way the category page already
// is. Category results (a query matching a category name) are shown
// above the product grid — search doesn't have to mean "only products."
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawSearchParams = await searchParams;
  const urlParams = toSearchParams(rawSearchParams);
  const query = urlParams.get('q') ?? '';
  const { filters, page } = parseSearchFilters(urlParams);

  const [{ products, totalCount }, categories] = query
    ? await Promise.all([searchProductsPage(query, filters, page), searchCategoriesPage(query)])
    : [{ products: [], totalCount: 0 }, []];

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">
        {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Search'}
      </h1>
      <p className="mt-1 mb-5 text-sm text-ink/60">
        {query ? `${totalCount} products` : 'Type in the search bar above to find a frame.'}
      </p>

      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`/category/${category.slug}`}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-tint transition-colors"
            >
              {category.name}
            </a>
          ))}
        </div>
      )}

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
