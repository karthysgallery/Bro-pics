import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface CategoryTilesProps {
  title: string;
  categories: Category[];
}

/** A short promise per collection, so the row says something a bare name
 *  cannot. Keyed by slug and skipped silently for anything unlisted. */
const TAGLINES: Record<string, string> = {
  'frames-wall-decor': 'Make your walls vibrant',
  'canvas-prints': 'Art that speaks',
  'collage-combo-sets': 'More memories together',
  'personalized-gifts': 'Thoughtful & unique',
};

/** Default fallbacks if image is missing */
const FALLBACK_IMAGES: Record<string, string> = {
  'frames-wall-decor': '/placeholders/categories/frames.jpg',
  'canvas-prints': '/placeholders/categories/canvas.jpg',
  'collage-combo-sets': '/placeholders/categories/collage.jpg',
  'personalized-gifts': '/placeholders/categories/gifts.jpg',
};

/**
 * Clean category cards with reduced curve radius, no outline,
 * full-bleed left image, and right-aligned text content.
 */
export function CategoryTiles({ title, categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} subtitle="Find the perfect piece for every moment" href="/category" />
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {categories.map((category) => {
          const imgSrc = category.image || FALLBACK_IMAGES[category.slug] || '/placeholders/products/classic-wooden-photo-frame-1.svg';
          const tagline = TAGLINES[category.slug] || 'Explore collection';

          return (
            <li key={category.id}>
              <Link
                href={`/category/${category.slug}`}
                className="group flex items-stretch h-[68px] sm:h-[72px] rounded-[18px] bg-white overflow-hidden shadow-xs hover:shadow-md transition-all duration-200"
              >
                {/* Left full-bleed image container */}
                <div className="relative w-[32%] sm:w-[35%] h-full shrink-0 overflow-hidden bg-[#EAEFF4]">
                  <Image
                    src={imgSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 120px, 160px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                {/* Right text container */}
                <div className="flex-1 flex flex-col justify-center px-4 py-2 min-w-0 bg-white">
                  <span className="block text-xs sm:text-sm font-bold text-[#0F172A] truncate leading-tight group-hover:text-gold transition-colors">
                    {category.name}
                  </span>
                  <span className="block text-[11px] sm:text-xs text-[#718096] truncate mt-0.5">
                    {tagline}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export default CategoryTiles;
