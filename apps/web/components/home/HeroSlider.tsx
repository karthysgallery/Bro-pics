import Link from 'next/link';
import Image from 'next/image';
import type { HomepageSection } from '@bro-pics/shared';

export function HeroSlider({ section }: { section: HomepageSection }) {
  return (
    <section className="relative">
      <div className="relative w-full h-[420px]">
        <Image
          src={section.mobileImage}
          alt={section.title}
          fill
          priority
          sizes="100vw"
          className="object-cover md:hidden"
        />
        <Image
          src={section.image}
          alt={section.title}
          fill
          priority
          sizes="100vw"
          className="object-cover hidden md:block"
        />
      </div>
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
