import type { HomepageSection } from '@bro-pics/shared';

export function OfferStrip({ section }: { section: HomepageSection }) {
  return (
    <div className="bg-sage text-cream text-center py-3 px-4 text-sm">
      {section.title}
    </div>
  );
}
