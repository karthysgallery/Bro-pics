import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getCategoryBySlug, searchProductsPage } from '../../../../lib/firestore-products';
import { ProductCard } from '../../../../components/product/ProductCard';
import { ProductFilters } from '../../../../components/filters/ProductFilters';
import { parseSearchFilters, PAGE_SIZE } from '@bro-pics/shared';
import { orientationFromSizeLabel } from '../../../../lib/orientation';

export const revalidate = 60;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
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

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return { title: 'Category Not Found | BroPics' };
  }

  const fallbackDescription = `Shop ${category.name} at BroPics.`;
  return {
    title: category.seo.title ?? `${category.name} | BroPics`,
    description: category.seo.description ?? fallbackDescription,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: category.seo.title ?? category.name,
      description: category.seo.description ?? fallbackDescription,
      images: [category.image],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const rawSearchParams = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const urlParams = toSearchParams(rawSearchParams);
  const { filters: parsedFilters, page } = parseSearchFilters(urlParams);
  const filters = { ...parsedFilters, categoryId: category.id };

  const { products: fetchedProducts, totalCount } = await searchProductsPage('', filters, page);
  const availableSizes = [...new Set(fetchedProducts.flatMap((p) => p.availableSizes))];
  const availableColours = [...new Set(fetchedProducts.flatMap((p) => p.availableColours))];
  const availableOrientations = [
    ...new Set(
      fetchedProducts
        .flatMap((p) => p.availableSizes)
        .map(orientationFromSizeLabel)
        .filter((o): o is NonNullable<typeof o> => o !== null)
    ),
  ];

  // Orientation has no backend field/index yet (see
  // docs/superpowers/specs/2026-09-14-frames-only-backend-changes.md), so
  // it's applied as a plain-JS post-filter over this page's already-fetched
  // products rather than a Firestore query constraint — totalCount above
  // reflects the pre-orientation-filter count, a known limitation.
  const selectedOrientations = urlParams.getAll('orientation');
  const products =
    selectedOrientations.length === 0
      ? fetchedProducts
      : fetchedProducts.filter((p) =>
          p.availableSizes.some((size) => {
            const orientation = orientationFromSizeLabel(size);
            return orientation !== null && selectedOrientations.includes(orientation);
          })
        );

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <nav aria-label="Breadcrumb" className="text-2xs text-ink/50 mb-2">
        <a href="/" className="hover:text-accent">Home</a>
        <span className="mx-1" aria-hidden="true">/</span>
        <a href="/category" className="hover:text-accent">Shop all</a>
        <span className="mx-1" aria-hidden="true">/</span>
        <span className="text-ink/70">{category.name}</span>
      </nav>

      {/* [FE-30] Category.heroImage/description (ABE-05) had no reader
          anywhere on the storefront until now — both are optional, so a
          category with neither renders exactly as before. */}
      {category.heroImage && (
        <div className="relative aspect-[16/6] md:aspect-[16/4] rounded-2xl overflow-hidden bg-tint mb-5">
          <Image src={category.heroImage} alt="" fill sizes="100vw" className="object-cover" />
        </div>
      )}

      <h1 className="text-2xl font-semibold text-ink">{category.name}</h1>
      {category.description && <p className="mt-2 max-w-2xl text-sm text-ink/70">{category.description}</p>}
      <p className="mt-1 mb-5 text-sm text-ink/60">{totalCount} products</p>

      <div className="grid md:grid-cols-[220px_1fr] md:gap-8">
        <ProductFilters
          availableSizes={availableSizes}
          availableColours={availableColours}
          availableOrientations={availableOrientations}
          initialSearch={urlParams.toString()}
        />

        {products.length === 0 ? (
          <p className="text-sm text-ink/60 py-8">
            Nothing matches those filters. Clear one and try again.
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-7">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <CategoryPagination currentPage={page} totalCount={totalCount} searchParams={urlParams} />
          </div>
        )}
      </div>
    </div>
  );
}

// [FE-30] `totalCount`/`page` are the SAME pre-orientation-filter figures
// already documented above (orientation is a client-side post-filter over
// this page's own results, not a Firestore constraint) — pagination
// necessarily paginates the underlying query, the same known limitation
// as the product count shown next to the page heading.
function CategoryPagination({
  currentPage,
  totalCount,
  searchParams,
}: {
  currentPage: number;
  totalCount: number;
  searchParams: URLSearchParams;
}) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages <= 1) return null;

  function hrefForPage(targetPage: number): string {
    const next = new URLSearchParams(searchParams);
    if (targetPage <= 1) next.delete('page');
    else next.set('page', String(targetPage));
    const query = next.toString();
    return query ? `?${query}` : '?';
  }

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 text-sm">
      {currentPage > 1 ? (
        <Link href={hrefForPage(currentPage - 1)} className="text-accent hover:text-accent-dark">
          ← Previous
        </Link>
      ) : (
        <span className="text-ink/30">← Previous</span>
      )}
      <span className="text-ink/60">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link href={hrefForPage(currentPage + 1)} className="text-accent hover:text-accent-dark">
          Next →
        </Link>
      ) : (
        <span className="text-ink/30">Next →</span>
      )}
    </nav>
  );
}
