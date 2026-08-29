import type { Category, HomepageSection, Product, Review } from '@bro-pics/shared';
import { HeroSlider } from './HeroSlider';
import { CategoryTiles } from './CategoryTiles';
import { HowItWorks } from './HowItWorks';
import { WhyUs } from './WhyUs';
import { OfferStrip } from './OfferStrip';
import { ProductRail } from './ProductRail';
import { ProductsInMotion } from './ProductsInMotion';
import { ReviewsTestimonials } from './ReviewsTestimonials';

export interface HomeSectionData {
  categories: Category[];
  bestSellers: Product[];
  featured: Product[];
  reviews: Review[];
}

export function renderHomeSection(section: HomepageSection, data: HomeSectionData) {
  switch (section.type) {
    case 'hero_slider':
      return <HeroSlider key={section.id} section={section} />;
    case 'category_tiles':
      return <CategoryTiles key={section.id} title={section.title} categories={data.categories} />;
    case 'best_sellers':
      return <ProductRail key={section.id} title={section.title} products={data.bestSellers} />;
    case 'how_it_works':
      return <HowItWorks key={section.id} section={section} />;
    case 'featured_collection':
      return <ProductRail key={section.id} title={section.title} products={data.featured} />;
    case 'products_in_motion':
      return <ProductsInMotion key={section.id} section={section} />;
    case 'reviews_testimonials':
      return <ReviewsTestimonials key={section.id} title={section.title} reviews={data.reviews} />;
    case 'why_us':
      return <WhyUs key={section.id} section={section} />;
    case 'offer_strip':
      return <OfferStrip key={section.id} section={section} />;
    case 'recently_viewed':
      // Client-side only (reads localStorage) — NOT YET IMPLEMENTED. This
      // section type is seeded and active but currently renders nothing.
      // A future task should add a client component reading recently-viewed
      // product IDs from localStorage and mount it directly in
      // apps/web/app/(shop)/page.tsx, since this registry only handles
      // server-renderable sections.
      return null;
    default:
      return null;
  }
}
