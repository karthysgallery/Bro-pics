import type { HomepageSection } from '@bro-pics/shared';

export function WhyUs({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 grid md:grid-cols-2 gap-6 items-center bg-white">
      <img src={section.image} alt={section.title} className="rounded-lg w-full" />
      <div>
        <h2 className="font-display text-2xl mb-2">{section.title}</h2>
        <p className="text-charcoal/70">{section.subtitle}</p>
      </div>
    </section>
  );
}
