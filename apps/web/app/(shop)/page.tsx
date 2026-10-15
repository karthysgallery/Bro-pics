import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { activeThemeOffer, resolveActiveTheme } from '@bro-pics/shared';
import { getThemeSettings } from '../../lib/firestore-settings';
import { FestiveGreeting } from '../../components/theme/FestiveGreeting';
import { DiwaliNight } from '../../components/theme/DiwaliNight';
import { FestivePromos } from '../../components/theme/FestivePromos';
import dynamic from 'next/dynamic';
import type { HomepageSection } from '@bro-pics/shared';
import {
  getActiveHomepageSections,
  getBestSellingProducts,
  getFeaturedProducts,
  getTrustVideos,
  getFeaturedReviews,
} from '../../lib/firestore-homepage';
import { getActiveCategories } from '../../lib/firestore-categories';
import { getPublishedCombos } from '../../lib/firestore-combos';
import { getSeoSettings } from '../../lib/firestore-settings';
import { ComboOffersStrip } from '../../components/home/ComboOffersStrip';
import { canonicalUrl, SITE_NAME } from '../../lib/seo/site';
import { HeroSlider } from '../../components/home/HeroSlider';
import { CategoryTiles } from '../../components/home/CategoryTiles';
import { ProductGrid } from '../../components/home/ProductGrid';
import { ProductRail } from '../../components/home/ProductRail';
import { OfferStrip } from '../../components/home/OfferStrip';
import { HowItWorks } from '../../components/home/HowItWorks';
import { WhyUs } from '../../components/home/WhyUs';
import { HomeReviewsCarousel } from '../../components/home/HomeReviewsCarousel';

// [FE-45] Both are 'use client' components rendered only below the fold
// (the trust reels, and the very last section on the page) — dynamic()
// defers their JS to a separate chunk instead of shipping it in the
// initial page bundle every visitor downloads whether or not they ever
// scroll that far. HeroSlider is deliberately NOT deferred this way — it's
// the page's own LCP element, so it needs to be ready immediately, not
// lazy.
const TrustReels = dynamic(() => import('../../components/home/TrustReels').then((mod) => mod.TrustReels));
const TrustReelsPreview = dynamic(() =>
  import('../../components/home/TrustReelsPreview').then((mod) => mod.TrustReelsPreview)
);
const RecentlyViewedRail = dynamic(() =>
  import('../../components/product/RecentlyViewedRail').then((mod) => mod.RecentlyViewedRail)
);

export const revalidate = 60;

const HOME_TITLE = 'Personalized Photo Frames & Gifts Online | KarthysGallery';
const HOME_DESCRIPTION =
  'Turn your photos into personalized frames, collages and gifts. Upload your pictures, preview the design online, and order from KarthysGallery.';

/** The owner's SEO settings (Admin → Settings → SEO) win; these defaults describe what the shop actually sells. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings().catch(() => null);
  const title = seo?.defaultTitle || HOME_TITLE;
  const description = seo?.defaultDescription || HOME_DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', siteName: SITE_NAME, url: '/', title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// Seeded sections still carry the old "products in motion" titles; those are
// replaced by the trust heading, while an admin-written title wins.
function trustTitle(title: string): string | undefined {
  const legacy = ['products in motion', 'in motion', 'see it in motion'];
  return !title || legacy.includes(title.trim().toLowerCase()) ? undefined : title;
}

// The page is a renderer for the admin-managed homepageSections collection:
// getActiveHomepageSections applies isActive + the startsAt/endsAt window and
// returns documents already ordered by sortOrder, and this walks that order.
// Reordering the homepage is therefore an admin action, not a code change —
// which is the whole point of the section architecture.
export default async function HomePage() {
  const [sections, categories, themeSettings] = await Promise.all([
    getActiveHomepageSections(),
    getActiveCategories(),
    getThemeSettings().catch(() => null),
  ]);
  // The festival on show (if any) greets visitors at the top of the homepage.
  const theme = themeSettings ? resolveActiveTheme(themeSettings) : null;
  const festival = theme && theme.id !== 'default' ? theme : null;
  const greeting = festival?.decor.greeting;
  const offer = activeThemeOffer(festival?.decor);
  const promos = festival?.decor.promos ?? [];

  // Every hero_slider doc becomes one poster in the single carousel at the
  // top. The band is drawn at the position of the first hero section and
  // skipped everywhere else — keyed on position rather than on the `id`
  // field, because that field is seeded data and is not guaranteed unique.
  const heroSections = sections.filter((s) => s.type === 'hero_slider');
  const firstHeroIndex = sections.findIndex((s) => s.type === 'hero_slider');
  const bestSellersSection = sections.find((s) => s.type === 'best_sellers');
  const featuredSection = sections.find((s) => s.type === 'featured_collection');
  const productsInMotionSection = sections.find((s) => s.type === 'products_in_motion');
  const reviewsSection = sections.find((s) => s.type === 'reviews_testimonials');

  const featuredCategoryId =
    typeof featuredSection?.config.categoryId === 'string' ? featuredSection.config.categoryId : categories[0]?.id;

  const combos = await getPublishedCombos().catch(() => []);
  const websiteJsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: canonicalUrl('/') };

  const [bestSellers, featuredProducts, trustVideos, featuredReviews] = await Promise.all([
    bestSellersSection ? getBestSellingProducts(10) : Promise.resolve([]),
    featuredSection && featuredCategoryId ? getFeaturedProducts(featuredCategoryId, 10) : Promise.resolve([]),
    productsInMotionSection ? getTrustVideos(12) : Promise.resolve([]),
    reviewsSection ? getFeaturedReviews(6) : Promise.resolve([]),
  ]);

  function renderSection(section: HomepageSection, index: number): ReactNode {
    switch (section.type) {
      case 'hero_slider':
        // Only the first hero doc draws the band; the rest are its posters.
        return index === firstHeroIndex ? <HeroSlider sections={heroSections} hasTrustVideos={trustVideos.length > 0} /> : null;
      case 'category_tiles':
        return <CategoryTiles title={section.title} categories={categories} />;
      case 'best_sellers':
        return (
          <ProductGrid
            title={section.title}
            subtitle={section.subtitle || undefined}
            products={bestSellers}
            viewAllHref={section.link || undefined}
          />
        );
      case 'offer_strip':
        return <OfferStrip section={section} />;
      case 'how_it_works':
        return <HowItWorks title={section.title} subtitle={section.subtitle || undefined} steps={section.steps} />;
      case 'featured_collection':
        return (
          <ProductRail
            title={section.title}
            products={featuredProducts}
            viewAllHref={section.link || undefined}
          />
        );
      case 'products_in_motion':
        // The "products in motion" slot is the trust section: real clips from
        // the admin video library, and nothing at all until some exist.
        if (trustVideos.length > 0) {
          return <TrustReels reels={trustVideos} title={trustTitle(section.title)} subtitle={section.subtitle || undefined} />;
        }
        return process.env.NODE_ENV !== 'production' ? <TrustReelsPreview /> : null;
      case 'reviews_testimonials':
        return <HomeReviewsCarousel title={section.title} reviews={featuredReviews} />;
      case 'why_us':
        return (
          <WhyUs
            title={section.title}
            subtitle={section.subtitle || undefined}
            image={section.image || undefined}
            valueProps={section.valueProps}
          />
        );
      case 'recently_viewed':
        // The rail owns its own spacing and renders nothing when empty —
        // wrapping it in a Section here left a blank band above the footer.
        return <RecentlyViewedRail />;
      default:
        return null;
    }
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      {greeting &&
        (greeting.art === 'diwali-night' ? <DiwaliNight greeting={greeting} offer={offer} /> : <FestiveGreeting greeting={greeting} />)}
      {/* Keyed by position as well as id: the `id` field comes from seeded
          data and duplicates across documents have been seen in practice,
          which React would otherwise treat as the same node. */}
      {sections.map((section, index) => (
        <div
          key={`${section.id}-${index}`}
          id={section.type === 'best_sellers' ? 'best-sellers' : undefined}
        >
          {renderSection(section, index)}
          {/* The festival's gift banners follow the hero. */}
          {index === firstHeroIndex && promos.length > 0 && <FestivePromos promos={promos} festival={festival!.name} />}
          {/* Combo offers sit right after the best sellers, where people are already comparing what to buy. */}
          {section.type === 'best_sellers' && <ComboOffersStrip combos={combos} />}
        </div>
      ))}
    </div>
  );
}
