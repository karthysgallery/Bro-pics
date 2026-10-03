import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getProductBySlug,
  getRelatedProducts,
  getFrequentlyBoughtTogether,
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
import { buildBreadcrumbList, buildProductReviewsJsonLd, resolveOgImage } from '../../../../lib/structured-data';
import { getSeoSettings } from '../../../../lib/firestore-settings';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  // [FE-16] ?edit={personalizationId} from the cart drawer's Edit link —
  // reading searchParams makes this one request dynamic (not served from
  // the static/ISR cache) without opting the whole route out of
  // generateStaticParams/revalidate for every other visit.
  searchParams: Promise<{ edit?: string }>;
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
  // [FE-42] Falls back to settings/seo.ogImagePath only when this
  // product has no primaryImageUrl of its own — never overrides a real
  // product photo.
  const seoSettings = await getSeoSettings().catch(() => null);
  const ogImage = resolveOgImage(product.primaryImageUrl, seoSettings);
  return {
    title: product.seo.title ?? `${product.title} | KarthysGallery`,
    description: product.seo.description ?? product.shortDesc,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.seo.title ?? product.title,
      description: product.seo.description ?? product.shortDesc,
      ...(ogImage && { images: [ogImage] }),
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const { edit: editPersonalizationId } = await searchParams;
  const detail = await getProductBySlug(slug);
  if (!detail) notFound();

  const { product, variants, media, reviews } = detail;
  const [relatedProducts, frequentlyBoughtTogether, category, templatesByVariant] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 8),
    getFrequentlyBoughtTogether(product),
    getCategoryById(product.categoryId),
    getFrameTemplatesByProductId(product.id),
  ]);
  const defaultVariant = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;

  // [FE-41] `review` was the one field this Product JSON-LD didn't
  // already carry despite `reviews` being right here — an omission, not
  // a deliberate choice (aggregateRating already summarized the same
  // data these individual entries source from).
  const productReviews = buildProductReviewsJsonLd(reviews);
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
    review: productReviews.length > 0 ? productReviews : undefined,
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

  // [FE-41] Mirrors the visible breadcrumb `<nav>` below exactly — same
  // trail, same labels, same hrefs — so the two can never show a
  // different path to the same page.
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Home', path: '/' },
    ...(category ? [{ name: category.name, path: `/category/${category.slug}` }] : []),
    { name: product.title, path: `/product/${product.slug}` },
  ]);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-ink/60 mb-5 flex items-center gap-1.5 font-sans">
        <Link href="/" className="hover:text-ink transition-colors">Home</Link>
        {category && (
          <>
            <span className="text-ink/40">/</span>
            <Link href={`/category/${category.slug}`} className="font-semibold text-ink hover:underline">
              {category.name}
            </Link>
          </>
        )}
        <span className="text-ink/40">/</span>
        <span className="text-ink/60">{product.title}</span>
      </nav>

      <ProductDetailClient
        product={product}
        variants={variants}
        media={media}
        initialTemplatesByVariant={templatesByVariant}
        editPersonalizationId={editPersonalizationId}
      />

      {/* Figma 4-item Trust Reassurance Bar */}
      <div className="my-12 py-6 border-y border-line grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-ink/80 text-xs md:text-sm font-medium">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>Archival-quality prints</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Handcrafted in India</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>Safe, tracked delivery</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>Happiness guaranteed</span>
        </div>
      </div>

      <ProductTabs product={product} variants={variants} />
      <VideoRail media={media} />
      <ReviewsSection product={product} reviews={reviews} />
      {frequentlyBoughtTogether.length > 0 && (
        <RelatedProducts products={frequentlyBoughtTogether} title="Frequently Bought Together" />
      )}
      <RelatedProducts products={relatedProducts} />
      <RecentlyViewedRail excludeProductId={product.id} />
    </div>
  );
}
