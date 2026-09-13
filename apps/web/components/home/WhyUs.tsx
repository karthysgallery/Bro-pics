import Image from 'next/image';
import type { HomepageSection } from '@bro-pics/shared';

export function WhyUs({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 grid md:grid-cols-2 gap-6 items-center bg-surface">
      <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
        <Image src={section.image} alt={section.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
      </div>
      <div>
        <h2 className="font-display text-2xl mb-2">{section.title}</h2>
        <p className="text-charcoal/70">{section.subtitle}</p>
      </div>
    </section>
  );
}
