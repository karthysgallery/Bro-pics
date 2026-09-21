import type { ReactNode } from 'react';
import type { HomepageSection } from '@bro-pics/shared';
import {
  getActiveHomepageSections,
  getBestSellingProducts,
  getFeaturedProducts,
  getHomepageVideos,
  getFeaturedReviews,
} from '../../lib/firestore-homepage';
import { getActiveCategories } from '../../lib/firestore-categories';
import { HeroSlider } from '../../components/home/HeroSlider';
import { CategoryTiles } from '../../components/home/CategoryTiles';
import { ProductGrid } from '../../components/home/ProductGrid';
import { ProductRail } from '../../components/home/ProductRail';
import { OfferStrip } from '../../components/home/OfferStrip';
import { HowItWorks } from '../../components/home/HowItWorks';
import { WhyUs } from '../../components/home/WhyUs';
import { HomeReviewsCarousel } from '../../components/home/HomeReviewsCarousel';
import { VideoRail } from '../../components/product/VideoRail';
import { RecentlyViewedRail } from '../../components/product/RecentlyViewedRail';
import { Section } from '../../components/ui/Section';

export const revalidate = 60;

// The page is a renderer for the admin-managed homepageSections collection:
// getActiveHomepageSections applies isActive + the startsAt/endsAt window and
// returns documents already ordered by sortOrder, and this walks that order.
// Reordering the homepage is therefore an admin action, not a code change —
// which is the whole point of the section architecture.
export default async function HomePage() {
  const [sections, categories] = await Promise.all([getActiveHomepageSections(), getActiveCategories()]);

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

  const [bestSellers, featuredProducts, homepageVideos, featuredReviews] = await Promise.all([
    bestSellersSection ? getBestSellingProducts(10) : Promise.resolve([]),
    featuredSection && featuredCategoryId ? getFeaturedProducts(featuredCategoryId, 10) : Promise.resolve([]),
    productsInMotionSection ? getHomepageVideos(8) : Promise.resolve([]),
    reviewsSection ? getFeaturedReviews(6) : Promise.resolve([]),
  ]);

  function renderSection(section: HomepageSection, index: number): ReactNode {
    switch (section.type) {
      case 'hero_slider':
        // Only the first hero doc draws the band; the rest are its posters.
        return index === firstHeroIndex ? <HeroSlider sections={heroSections} /> : null;
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
        return <HowItWorks title={section.title} subtitle={section.subtitle || undefined} />;
      case 'featured_collection':
        return (
          <ProductRail
            title={section.title}
            products={featuredProducts}
            viewAllHref={section.link || undefined}
          />
        );
      case 'products_in_motion':
        return homepageVideos.length > 0 ? (
          <Section space="tight">
            <VideoRail title={section.title} media={homepageVideos} />
          </Section>
        ) : null;
      case 'reviews_testimonials':
        return <HomeReviewsCarousel title={section.title} reviews={featuredReviews} />;
      case 'why_us':
        return <WhyUs title={section.title} subtitle={section.subtitle || undefined} image={section.image || undefined} />;
      case 'recently_viewed':
        return (
          <Section space="tight">
            <RecentlyViewedRail />
          </Section>
        );
      default:
        return null;
    }
  }

  return (
    <div>
      {/* Keyed by position as well as id: the `id` field comes from seeded
          data and duplicates across documents have been seen in practice,
          which React would otherwise treat as the same node. */}
      {sections.map((section, index) => (
        <div
          key={`${section.id}-${index}`}
          id={section.type === 'best_sellers' ? 'best-sellers' : undefined}
        >
          {renderSection(section, index)}
        </div>
      ))}
    </div>
  );
}
