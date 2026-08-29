import Link from 'next/link';
import type { HomepageSection } from '@bro-pics/shared';

export function HeroSlider({ section }: { section: HomepageSection }) {
  return (
    <section className="relative">
      <picture>
        <source media="(max-width: 767px)" srcSet={section.mobileImage} />
        <img src={section.image} alt={section.title} className="w-full h-[420px] object-cover" />
      </picture>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-charcoal/20">
        <h1 className="font-display text-4xl md:text-6xl text-cream">{section.title}</h1>
        <p className="text-cream mt-2 max-w-md">{section.subtitle}</p>
        {section.link && (
          <Link href={section.link} className="mt-4 bg-terracotta text-cream rounded-full px-6 py-3">
            Explore Collection
          </Link>
        )}
      </div>
    </section>
  );
}
