import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getProductBySlug,
  findCurrentSlugForOldSlug,
  getRelatedProducts,
  getFrequentlyBoughtTogether,
  getAllActiveProductSlugs,
  getCategoryById,
  getFrameTemplatesByProductId,
  getPersonalizationTemplatesByVariant,
} from '../../../../lib/firestore-product-detail';
import { Suspense } from 'react';
import { ProductDetailClient } from '../../../../components/product/ProductDetailClient';
import { ProductDetailWithUrlParams } from '../../../../components/product/ProductDetailWithUrlParams';
import { ProductTabs } from '../../../../components/product/ProductTabs';
import { VideoRail } from '../../../../components/product/VideoRail';
import { ReviewsSection } from '../../../../components/product/ReviewsSection';
import { RelatedProducts } from '../../../../components/product/RelatedProducts';
import { RecentlyViewedRail } from '../../../../components/product/RecentlyViewedRail';
import { buildBreadcrumbList, buildProductJsonLd, resolveOgImage } from '../../../../lib/structured-data';
import { getSeoSettings, getShippingSettings, getSiteText } from '../../../../lib/firestore-settings';
import { productCanonicalPath, productImageAlt, productSeoDescription, productSeoTitle } from '../../../../lib/seo/product-seo';
import { SITE_NAME } from '../../../../lib/seo/site';
import { getPublishedCombos } from '../../../../lib/firestore-combos';
import { DEFAULT_SITE_TEXT } from '@bro-pics/shared';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  // No searchParams on purpose: reading the query string on the server would make every product page uncacheable.
  // ?edit= and ?variantId= are applied in the browser (ProductDetailWithUrlParams).
}

export async function generateStaticParams() {
  const slugs = await getAllActiveProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);

  if (!detail) {
    // Thrown HERE (while metadata resolves, before any HTML is sent) so the response really is a 404 / a permanent
    // redirect. Left to the page body, the loading skeleton has already been sent and the status would stay 200 (a "soft 404").
    const current = await findCurrentSlugForOldSlug(slug).catch(() => null);
    if (current && current !== slug) permanentRedirect(`/product/${current}`);
    notFound();
  }

  const { product } = detail;
  // [FE-42] Falls back to settings/seo.ogImagePath only when this
  // product has no primaryImageUrl of its own — never overrides a real
  // product photo.
  const seoSettings = await getSeoSettings().catch(() => null);
  const ogImage = resolveOgImage(product.primaryImageUrl, seoSettings);
  const seo = product.seo ?? {};
  // Title and description come from this product's own data (the owner's wording wins), never a shared template string.
  const title = productSeoTitle(product);
  const description = productSeoDescription(product);
  const keywords = [seo.focusKeyword, ...(seo.keywords ?? [])].filter((k): k is string => Boolean(k && k.trim()));
  const images = ogImage ? [{ url: ogImage, alt: productImageAlt(product) }] : undefined;
  const canonical = productCanonicalPath(product.slug);
  return {
    title,
    description,
    ...(keywords.length > 0 && { keywords }),
    // Every product is its own canonical page (never the category), whatever query string it was reached with.
    alternates: { canonical },
    ...(seo.noindex && { robots: { index: false, follow: true } }),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: canonical,
      title: seo.title || product.title,
      description,
      ...(images && { images }),
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title || product.title,
      description,
      ...(images && { images: images.map((i) => i.url) }),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail) {
    // A product that was renamed answers its old address with a permanent redirect; anything else is a real 404.
    const current = await findCurrentSlugForOldSlug(slug).catch(() => null);
    if (current && current !== slug) permanentRedirect(`/product/${current}`);
    notFound();
  }

  const { product, variants, media, reviews } = detail;
  const [relatedProducts, frequentlyBoughtTogether, category, templatesByVariant, personalizationTemplatesByVariant] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 8),
    getFrequentlyBoughtTogether(product),
    getCategoryById(product.categoryId),
    getFrameTemplatesByProductId(product.id),
    getPersonalizationTemplatesByVariant(product, variants),
  ]);
  const siteText = await getSiteText().catch(() => DEFAULT_SITE_TEXT);
  const shippingSettings = await getShippingSettings().catch(() => null);
  // Combo offers that include this product: a real, contextual internal link in both directions (the combo page links to its products).
  const productCombos = (await getPublishedCombos().catch(() => [])).filter((c) => c.items.some((i) => i.productId === product.id));
  const defaultVariant = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;

  const detailProps = {
    product,
    variants,
    media,
    initialTemplatesByVariant: templatesByVariant,
    personalizationTemplatesByVariant,
  };

  const jsonLd = buildProductJsonLd({
    product,
    variants,
    media,
    reviews,
    categoryName: category?.name,
    description: productSeoDescription(product),
    ...(shippingSettings && {
      shipping: {
        freeShippingThreshold: shippingSettings.freeShippingThreshold,
        flatShippingCharge: shippingSettings.flatShippingCharge,
        dispatchDaysMin: product.dispatchDaysMin,
        dispatchDaysMax: product.dispatchDaysMax,
      },
    }),
  });

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
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

      {/* The fallback is the page the server renders for everyone (and for crawlers); the browser then applies ?edit= / ?variantId=. */}
      <Suspense fallback={<ProductDetailClient {...detailProps} />}>
        <ProductDetailWithUrlParams {...detailProps} />
      </Suspense>

      {/* Figma 4-item Trust Reassurance Bar */}
      <div className="my-12 py-6 border-y border-line grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-ink/80 text-xs md:text-sm font-medium">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>{siteText.trust1}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>{siteText.trust2}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>{siteText.trust3}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>{siteText.trust4}</span>
        </div>
      </div>

      {productCombos.length > 0 && (
        <section aria-labelledby="product-combos" className="mb-10">
          <h2 id="product-combos" className="font-display text-xl font-bold text-ink">Also in a combo offer</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {productCombos.map((combo) => (
              <li key={combo.id}>
                <Link href={`/combo/${combo.slug}`} className="inline-flex rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold">
                  {combo.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
