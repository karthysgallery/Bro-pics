import type { HomepageSection } from '@bro-pics/shared';

export function ProductsInMotion({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 bg-surface">
      <h2 className="font-display text-2xl text-center mb-6">{section.title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 justify-center">
        <video
          className="w-40 h-72 object-cover rounded-lg"
          src="/placeholders/videos/product-demo.mp4"
          muted
          loop
          playsInline
          autoPlay
        />
      </div>
    </section>
  );
}
