import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';
import type { HomepageStep } from '@bro-pics/shared';

interface HowItWorksProps {
  title: string;
  subtitle?: string;
  steps?: HomepageStep[];
}

// [FE-26] This genuinely is a sequence, so the steps are numbered — the
// number is the only ornament each step gets. Kept as the fallback for
// when `section.steps` is absent (no seeded/admin-authored how_it_works
// doc has one yet) rather than rendering an empty section.
const DEFAULT_STEPS: HomepageStep[] = [
  { label: 'Upload', desc: 'Pick your favourite photo from your phone or camera.' },
  { label: 'Adjust', desc: 'Crop, zoom and rotate it to fit the frame.' },
  { label: 'Preview', desc: 'See exactly how it will look inside the frame, live.' },
  { label: 'Order', desc: 'Confirm, and we print, frame and dispatch it.' },
];

export function HowItWorks({ title, subtitle, steps }: HowItWorksProps) {
  const resolvedSteps = steps && steps.length > 0 ? steps : DEFAULT_STEPS;
  return (
    <Section tone="tint">
      <SectionHeader title={title} subtitle={subtitle} href="/how-it-works" linkLabel="Read the full guide" />
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6">
        {resolvedSteps.map((step, index) => (
          <li key={step.label}>
            <span className="w-8 h-8 rounded-full bg-gold text-ink text-sm font-bold flex items-center justify-center">
              {index + 1}
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{step.label}</p>
            <p className="mt-0.5 text-sm text-ink/60">{step.desc}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
