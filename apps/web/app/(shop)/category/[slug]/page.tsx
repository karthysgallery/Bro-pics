import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, permanentRedirect } from 'next/navigation';
import { getCategoryBySlug, searchProductsPage } from '../../../../lib/firestore-products';
import { ProductCard } from '../../../../components/product/ProductCard';
import { ProductFilters } from '../../../../components/filters/ProductFilters';
import { parseSearchFilters, PAGE_SIZE } from '@bro-pics/shared';
import { orientationFromSizeLabel } from '../../../../lib/orientation';
import { buildBreadcrumbList, resolveOgImage } from '../../../../lib/structured-data';
import { getSeoSettings } from '../../../../lib/firestore-settings';
import { getPublishedCombos } from '../../../../lib/firestore-combos';
import { getActiveCategories } from '../../../../lib/firestore-categories';
import { categoryCanonicalPath, categorySeoDescription, categorySeoTitle } from '../../../../lib/seo/category-seo';
import { canonicalUrl, SITE_NAME } from '../../../../lib/seo/site';

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

// [FE-42] A URL stacking two or more facets (size+colour, size+page-2,
// etc.) has no independent SEO value of its own — it's the same listing
// as the bare category URL, just pre-filtered for one visitor's own
// session. `alternates.canonical` (below, unconditional) already points
// every such URL back at the bare category page; `noindex` is a second,
// stronger layer for exactly the cases a canonical hint alone might not
// stop a crawler from indexing anyway. `follow: true` throughout — a
// filtered page's product links are still real, crawlable products.
function shouldNoindexFacetedUrl(urlParams: URLSearchParams): boolean {
  // Pagination alone is NOT a reason to noindex: page 2 lists different products and is its own canonical page.
  const facetKeys = ['size', 'colour', 'material', 'orientation', 'minRating', 'inStockOnly', 'sort', 'minPrice', 'maxPrice'];
  const activeFacetCount = facetKeys.filter((key) => urlParams.has(key)).length;
  return activeFacetCount >= 2;
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (slug === 'all') permanentRedirect('/category');
  const category = await getCategoryBySlug(slug);

  // Thrown while metadata resolves so an unknown category is a real 404, not a 200 page that says "not found".
  if (!category) notFound();

  const urlParams = toSearchParams(await searchParams);
  const { page } = parseSearchFilters(urlParams);
  // [FE-42] Falls back to settings/seo.ogImagePath only when this
  // category has no image of its own — never overrides a real one.
  const seoSettings = await getSeoSettings().catch(() => null);
  const ogImage = resolveOgImage(category.image, seoSettings);
  let totalCount = 0;
  try {
    totalCount = (await searchProductsPage('', { categoryId: category.id }, 1))?.totalCount ?? 0;
  } catch {
    // The description then simply doesn't mention a count.
  }
  const title = categorySeoTitle(category);
  const description = categorySeoDescription(category, totalCount);
  // Filters/sorting canonicalize to the bare category; only real pagination keeps its own address.
  const hasFacet = ['size', 'colour', 'material', 'orientation', 'minRating', 'inStockOnly', 'sort', 'minPrice', 'maxPrice'].some((k) => urlParams.has(k));
  const canonical = categoryCanonicalPath(category.slug, hasFacet ? 1 : page);
  return {
    title: page > 1 && !hasFacet ? `${title} — Page ${page}` : title,
    description,
    alternates: { canonical },
    ...(shouldNoindexFacetedUrl(urlParams) && { robots: { index: false, follow: true } }),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: canonical,
      title: category.seo.title ?? category.name,
      description,
      ...(ogImage && { images: [ogImage] }),
    },
    twitter: { card: 'summary_large_image', title: category.seo.title ?? category.name, description, ...(ogImage && { images: [ogImage] }) },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const rawSearchParams = await searchParams;
  // Older links (the seeded "Shop all frames" button) point at /category/all; every product lives on /category.
  if (slug === 'all') permanentRedirect('/category');

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

  // [FE-41] Mirrors the visible breadcrumb `<nav>` below exactly.
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Home', path: '/' },
    { name: 'Shop all', path: '/category' },
    { name: category.name, path: `/category/${category.slug}` },
  ]);

  // The listing as structured data: what this page is and which products it lists, using the same addresses as the sitemap.
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    url: canonicalUrl(categoryCanonicalPath(category.slug, page)),
    ...(category.description && { description: category.description }),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: totalCount,
      itemListElement: products.map((p, index) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + index + 1,
        url: canonicalUrl(`/product/${p.slug}`),
        name: p.title,
      })),
    },
  };
  // Related categories, for people (and crawlers) who want a neighbouring collection.
  const otherCategories = (await getActiveCategories().catch(() => [])).filter((c) => c.id !== category.id).slice(0, 8);
  const hasCombos = (await getPublishedCombos().catch(() => [])).length > 0;

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd).replace(/</g, '\\u003c') }} />

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

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-ink">{category.name}</h1>
        {category.description && (
          <p className="mt-2.5 max-w-3xl text-sm text-ink/75 leading-relaxed">{category.description}</p>
        )}
        <p className="mt-2 text-xs font-semibold text-ink/60">{totalCount} pieces available</p>
      </div>

      <div className="grid md:grid-cols-[240px_1fr] md:gap-8">
        <ProductFilters
          availableSizes={availableSizes}
          availableColours={availableColours}
          availableOrientations={availableOrientations}
          initialSearch={urlParams.toString()}
        />

        {products.length === 0 ? (
          <div className="rounded-2xl border border-line bg-paper p-8 text-center">
            <p className="text-sm font-semibold text-ink">No frames found matching your filters</p>
            <p className="text-xs text-ink/60 mt-1">Try clearing some filters or browsing all collections.</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <CategoryPagination currentPage={page} totalCount={totalCount} searchParams={urlParams} />
          </div>
        )}
      </div>

      {(otherCategories.length > 0 || hasCombos) && (
        <nav aria-label="More collections" className="mt-12 border-t border-line pt-6">
          <h2 className="font-display text-lg font-bold text-ink">More collections</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {otherCategories.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} className="inline-flex rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-gold">
                  {c.name}
                </Link>
              </li>
            ))}
            {hasCombos && (
              <li>
                <Link href="/combos" className="inline-flex rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-gold">
                  Combo offers
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
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
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-3 text-xs">
      {currentPage > 1 ? (
        <Link
          href={hrefForPage(currentPage - 1)}
          className="rounded-full border border-line bg-paper px-4 py-2 font-semibold text-ink hover:border-ink hover:text-ink transition-all shadow-xs"
        >
          ← Previous
        </Link>
      ) : (
        <span className="rounded-full border border-line/40 bg-paper/50 px-4 py-2 font-medium text-ink/30 cursor-not-allowed">
          ← Previous
        </span>
      )}
      <span className="rounded-full bg-tint px-4 py-2 font-semibold text-ink">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link
          href={hrefForPage(currentPage + 1)}
          className="rounded-full border border-line bg-paper px-4 py-2 font-semibold text-ink hover:border-ink hover:text-ink transition-all shadow-xs"
        >
          Next →
        </Link>
      ) : (
        <span className="rounded-full border border-line/40 bg-paper/50 px-4 py-2 font-medium text-ink/30 cursor-not-allowed">
          Next →
        </span>
      )}
    </nav>
  );
}

