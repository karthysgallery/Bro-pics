import { notFound } from 'next/navigation';
import { getCategoryBySlug, searchProductsPage } from '../../../../lib/firestore-products';
import { ProductCard } from '../../../../components/product/ProductCard';
import { CategoryFilters } from './CategoryFilters';
import { parseSearchFilters } from '@bro-pics/shared';

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

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const rawSearchParams = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const urlParams = toSearchParams(rawSearchParams);
  const { filters: parsedFilters, page } = parseSearchFilters(urlParams);
  const filters = { ...parsedFilters, categoryId: category.id };

  const { products, totalCount } = await searchProductsPage('', filters, page);
  const availableSizes = [...new Set(products.flatMap((p) => p.availableSizes))];
  const availableColours = [...new Set(products.flatMap((p) => p.availableColours))];

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="font-display text-3xl mb-2">{category.name}</h1>
      <p className="text-charcoal/70 mb-6">{totalCount} products</p>

      <div className="grid md:grid-cols-[240px_1fr] gap-8">
        <CategoryFilters
          availableSizes={availableSizes}
          availableColours={availableColours}
          initialSearch={urlParams.toString()}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}
