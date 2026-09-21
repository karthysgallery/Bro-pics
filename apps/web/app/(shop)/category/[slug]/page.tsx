import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategoryBySlug, searchProductsPage } from '../../../../lib/firestore-products';
import { ProductCard } from '../../../../components/product/ProductCard';
import { CategoryFilters } from './CategoryFilters';
import { parseSearchFilters } from '@bro-pics/shared';
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

      <h1 className="text-2xl font-semibold text-ink">{category.name}</h1>
      <p className="mt-1 mb-5 text-sm text-ink/60">{totalCount} products</p>

      <div className="grid md:grid-cols-[220px_1fr] md:gap-8">
        <CategoryFilters
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-7">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
