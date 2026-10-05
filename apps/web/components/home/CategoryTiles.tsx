import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface CategoryTilesProps {
  title: string;
  categories: Category[];
}

const TAGLINES: Record<string, string> = {
  'frames-wall-decor': 'Make your walls vibrant',
  'canvas-prints': 'Art that speaks',
  'collage-combo-sets': 'More memories together',
  'personalized-gifts': 'Thoughtful & unique',
};

const FALLBACK_IMAGES: Record<string, string> = {
  'frames-wall-decor': '/placeholders/categories/frames.jpg',
  'canvas-prints': '/placeholders/categories/canvas.jpg',
  'collage-combo-sets': '/placeholders/categories/collage.jpg',
  'personalized-gifts': '/placeholders/categories/gifts.jpg',
};

/**
 * Horizontal category tiles. Clean image-left / text-right layout.
 * Minimal rounding, no shadows, warm border on hover.
 */
export function CategoryTiles({ title, categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} subtitle="Find the perfect piece for every moment" href="/category" />
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {categories.map((category) => {
          const imgSrc =
            category.image ||
            FALLBACK_IMAGES[category.slug] ||
            '/placeholders/products/classic-wooden-photo-frame-1.svg';
          const tagline = TAGLINES[category.slug] || 'Explore collection';

          return (
            <li key={category.id}>
              <Link
                href={`/category/${category.slug}`}
                className="group flex items-stretch h-16 sm:h-[72px] rounded-card bg-paper overflow-hidden border border-line/60 hover:border-ink/20 transition-colors duration-180"
              >
                {/* Left image */}
                <div className="relative w-[30%] h-full shrink-0 overflow-hidden bg-tint">
                  <Image
                    src={imgSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100px, 140px"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.06]"
                  />
                </div>

                {/* Right text */}
                <div className="flex-1 flex flex-col justify-center px-4 py-2 min-w-0">
                  <span className="block text-[13px] font-semibold text-ink truncate leading-tight group-hover:text-accent transition-colors duration-140">
                    {category.name}
                  </span>
                  <span className="block text-[11px] text-ink/45 truncate mt-0.5">
                    {tagline}
                  </span>
                </div>

                {/* Trailing arrow */}
                <div className="flex items-center pr-3 text-ink/30 group-hover:text-ink/60 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
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
