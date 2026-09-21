import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getProductBySlug,
  getRelatedProducts,
  getAllActiveProductSlugs,
  getCategoryById,
  getFrameTemplatesByProductId,
} from '../../../../lib/firestore-product-detail';
import { ProductDetailClient } from '../../../../components/product/ProductDetailClient';
import { ProductTabs } from '../../../../components/product/ProductTabs';
import { VideoRail } from '../../../../components/product/VideoRail';
import { ReviewsSection } from '../../../../components/product/ReviewsSection';
import { RelatedProducts } from '../../../../components/product/RelatedProducts';
import { RecentlyViewedRail } from '../../../../components/product/RecentlyViewedRail';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllActiveProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);

  if (!detail) {
    return { title: 'Product Not Found | BroPics' };
  }

  const { product } = detail;
  return {
    title: product.seo.title ?? `${product.title} | BroPics`,
    description: product.seo.description ?? product.shortDesc,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.seo.title ?? product.title,
      description: product.seo.description ?? product.shortDesc,
      images: [product.primaryImageUrl],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail) notFound();

  const { product, variants, media, reviews } = detail;
  const [relatedProducts, category, templatesByVariant] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 8),
    getCategoryById(product.categoryId),
    getFrameTemplatesByProductId(product.id),
  ]);
  const defaultVariant = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.shortDesc,
    image: product.primaryImageUrl,
    aggregateRating:
      product.ratingCount > 0
        ? { '@type': 'AggregateRating', ratingValue: product.ratingAverage, reviewCount: product.ratingCount }
        : undefined,
    offers: defaultVariant
      ? {
          '@type': 'Offer',
          price: (defaultVariant.price / 100).toFixed(2),
          priceCurrency: 'INR',
          availability:
            defaultVariant.stockStatus === 'in_stock'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        }
      : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-2xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-accent">Home</Link>
        {category && (
          <>
            {' / '}
            <Link href={`/category/${category.slug}`} className="hover:text-accent">{category.name}</Link>
          </>
        )}
        {' / '}
        <span className="text-ink/70">{product.title}</span>
      </nav>

      <ProductDetailClient
        product={product}
        variants={variants}
        media={media}
        initialTemplatesByVariant={templatesByVariant}
      />

      <ProductTabs product={product} variants={variants} />
      <VideoRail media={media} />
      <ReviewsSection product={product} reviews={reviews} />
      <RelatedProducts products={relatedProducts} />
      <RecentlyViewedRail excludeProductId={product.id} />
    </div>
  );
}
