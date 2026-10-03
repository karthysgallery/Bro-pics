import type { Metadata } from 'next';
import Image from 'next/image';
import { searchProductsPage, searchCategoriesPage } from '../../../lib/firestore-products';
import { getBestSellingProducts } from '../../../lib/firestore-homepage';
import { ProductCard } from '../../../components/product/ProductCard';
import { ProductFilters } from '../../../components/filters/ProductFilters';
import { parseSearchFilters } from '@bro-pics/shared';
import { orientationFromSizeLabel } from '../../../lib/orientation';

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

  // [FE-31] Recommendations for the empty state — a search that matched
  // nothing used to just point at "browse all collections" with no
  // actual products shown. Best sellers is the same real recommendation
  // source the homepage's own best_sellers section already uses, not a
  // new one invented for this page.
  const recommendations = query && products.length === 0 ? await getBestSellingProducts(8) : [];

  const availableSizes = [...new Set(products.flatMap((p) => p.availableSizes))];
  const availableColours = [...new Set(products.flatMap((p) => p.availableColours))];
  const availableOrientations = [
    ...new Set(
      products
        .flatMap((p) => p.availableSizes)
        .map(orientationFromSizeLabel)
        .filter((o): o is NonNullable<typeof o> => o !== null)
    ),
  ];

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <a href="/" className="hover:text-ink">Home</a>
        {' / '}
        <span className="text-ink font-medium">Search</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          Find your next frame.
        </h1>
        <p className="text-xs text-ink/70">
          Search by style, size or the story you want to tell.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start mb-8">
        <div>
          <label htmlFor="search-input" className="block text-2xs font-semibold text-ink/60 mb-2">Search BroPics</label>
          <form action="/search" method="GET" className="relative">
            <input
              id="search-input"
              name="q"
              defaultValue={query}
              placeholder="e.g. black frame, 12x16, gallery wall"
              className="w-full h-12 px-5 rounded-2xl border border-line bg-paper text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-accent shadow-sm"
            />
          </form>

          {query && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <a
                href={`/search?q=${encodeURIComponent(query)}`}
                className="px-4 py-2 rounded-full bg-ink text-paper text-xs font-semibold"
              >
                All results ({totalCount})
              </a>
              <span className="text-xs text-ink/60 ml-2">
                {totalCount} results for &ldquo;{query}&rdquo;
              </span>
            </div>
          )}
        </div>

        {/* Suggested Searches Card */}
        <div className="rounded-3xl bg-paper border border-line p-6 shadow-sm">
          <h2 className="font-display text-sm font-bold text-ink mb-3">Suggested searches</h2>
          <div className="space-y-2 text-xs">
            <a href="/search?q=black+photo+frames" className="flex items-center justify-between text-ink/80 hover:text-accent font-medium py-1">
              <span>Black photo frames</span>
              <span>↗</span>
            </a>
            <a href="/search?q=12x16+frames" className="flex items-center justify-between text-ink/80 hover:text-accent font-medium py-1">
              <span>12 × 16 inch frames</span>
              <span>↗</span>
            </a>
            <a href="/search?q=gallery+wall" className="flex items-center justify-between text-ink/80 hover:text-accent font-medium py-1">
              <span>Black gallery wall set</span>
              <span>↗</span>
            </a>
          </div>
          <p className="mt-4 pt-3 border-t border-line text-2xs text-ink/50">
            POPULAR · Wedding frames · Family collage
          </p>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-3">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`/category/${category.slug}`}
              className="flex items-center gap-2 rounded-full border border-line pl-2 pr-4 py-2 text-xs font-semibold text-ink bg-paper hover:bg-tint transition-colors"
            >
              <span className="relative w-6 h-6 rounded-full overflow-hidden bg-tint shrink-0">
                {category.image && <Image src={category.image} alt="" fill sizes="24px" className="object-cover" />}
              </span>
              {category.name}
            </a>
          ))}
        </div>
      )}

      {products.length === 0 && query ? (
        <div className="py-12 text-center bg-field rounded-3xl border border-line p-8 my-6">
          <p className="text-base font-semibold text-ink mb-2">Nothing matched that search.</p>
          <p className="text-xs text-ink/60 mb-6">Try searching for a different size, color, or collection.</p>
          <a
            href="/category"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors"
          >
            Browse all collections →
          </a>

          {recommendations.length > 0 && (
            <div className="mt-12 text-left">
              <h2 className="font-display text-xl font-bold text-ink mb-6">You might like</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {recommendations.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : query ? (
        <div className="grid md:grid-cols-[220px_1fr] md:gap-8 items-start my-6">
          <ProductFilters
            availableSizes={availableSizes}
            availableColours={availableColours}
            availableOrientations={availableOrientations}
            initialSearch={urlParams.toString()}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Bottom callout banner */}
      <div className="mt-12 p-6 rounded-3xl bg-field border border-line">
        <h3 className="font-display text-base font-bold text-ink mb-1">No exact match? A frame can be personal.</h3>
        <p className="text-xs text-ink/70">
          Try &ldquo;oak&rdquo;, &ldquo;collage&rdquo; or a size like &ldquo;8 × 10&rdquo;. Every frame includes your own photo.
        </p>
      </div>
    </div>
  );
}
