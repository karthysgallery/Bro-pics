import Image from 'next/image';
import { Section } from '../ui/Section';

interface WhyUsProps {
  title: string;
  subtitle?: string;
  image?: string;
  valueProps?: string[];
}

// [FE-26] Fallback for when `section.valueProps` is absent — no seeded/
// admin-authored why_us doc has one yet, so this keeps the section from
// rendering with no bullets at all rather than being a source of truth.
const DEFAULT_VALUE_PROPS = [
  'Handcrafted with premium materials and checked before it ships',
  'Carefully packed to survive the journey, every single time',
  'Dispatched on time, with tracking from the moment it leaves us',
];

// Static trust block — the spec calls for a factory/production video
// alongside this content, but no factory video asset exists yet, so this
// pairs the section's real image (from the sec_why_us homepage doc) with
// text instead of faking a video player around a still image.
export function WhyUs({ title, subtitle, image, valueProps }: WhyUsProps) {
  const points = valueProps && valueProps.length > 0 ? valueProps : DEFAULT_VALUE_PROPS;
  return (
    <Section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
        {image && (
          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-tint order-2 md:order-1">
            <Image src={image} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
          </div>
        )}
        <div className="order-1 md:order-2">
          <h2 className="text-xl md:text-2xl font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
          <ul className="mt-5 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#14213D"
                  strokeWidth="2.4"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M4 12.5l5 5L20 6.5" />
                </svg>
                <span className="text-sm text-ink/80">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
