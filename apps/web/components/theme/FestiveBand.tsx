import { useId } from 'react';
import type { ThemeDecor } from '@bro-pics/shared';

/** One repeat of each motif, drawn in a 48×16 tile with the theme's own colours. */
const TILES: Record<Exclude<ThemeDecor['motif'], 'none'>, JSX.Element> = {
  // An oil lamp: clay bowl and a flame.
  diya: (
    <>
      <path d="M14 11 Q24 16 34 11 Q24 13.5 14 11 Z" fill="rgb(var(--color-accent))" />
      <path d="M14 11 Q24 15 34 11" fill="none" stroke="rgb(var(--color-accent))" strokeWidth="1.2" />
      <path d="M24 3 Q27 7 24 10 Q21 7 24 3 Z" fill="rgb(var(--color-gold))" />
      <circle cx="24" cy="8.4" r="0.9" fill="rgb(var(--color-paper))" />
    </>
  ),
  // A kolam: a dot grid looped by one line.
  kolam: (
    <>
      {[12, 24, 36].map((x) => (
        <circle key={x} cx={x} cy="8" r="1.1" fill="rgb(var(--color-accent))" />
      ))}
      <path d="M6 8 C6 2 18 2 18 8 C18 14 30 14 30 8 C30 2 42 2 42 8" fill="none" stroke="rgb(var(--color-gold-deep))" strokeWidth="1.1" />
    </>
  ),
  star: (
    <>
      <path d="M24 3 L25.4 6.8 L29.4 6.9 L26.2 9.3 L27.4 13.1 L24 10.8 L20.6 13.1 L21.8 9.3 L18.6 6.9 L22.6 6.8 Z" fill="rgb(var(--color-gold))" />
      <circle cx="8" cy="8" r="1" fill="rgb(var(--color-accent))" />
      <circle cx="40" cy="8" r="1" fill="rgb(var(--color-accent))" />
    </>
  ),
  sparkle: (
    <>
      <path d="M24 2 Q25 7 30 8 Q25 9 24 14 Q23 9 18 8 Q23 7 24 2 Z" fill="rgb(var(--color-gold))" />
      <path d="M8 6 Q8.5 8 10.5 8.5 Q8.5 9 8 11 Q7.5 9 5.5 8.5 Q7.5 8 8 6 Z" fill="rgb(var(--color-accent))" opacity="0.7" />
    </>
  ),
  // A sugarcane stalk with a leaf.
  sugarcane: (
    <>
      <rect x="22.5" y="1" width="3" height="14" rx="1.2" fill="rgb(var(--color-accent))" />
      <path d="M22.5 5.5 h3 M22.5 10 h3" stroke="rgb(var(--color-paper))" strokeWidth="0.8" />
      <path d="M25.5 4 Q32 1 36 4 Q31 4 25.5 6 Z" fill="rgb(var(--color-gold-deep))" />
    </>
  ),
};

/** A thin ornamental strip under the header while a festival theme is on. */
export function FestiveBand({ motif }: { motif: ThemeDecor['motif'] }) {
  // Unique per band: each pattern takes its colours from where it is drawn.
  const id = `festive-${useId().replace(/:/g, '')}`;
  if (motif === 'none') return null;
  return (
    <div aria-hidden="true" className="h-4 w-full border-b border-line/70 bg-paper">
      <svg width="100%" height="16" preserveAspectRatio="none">
        <defs>
          <pattern id={id} width="48" height="16" patternUnits="userSpaceOnUse">
            {TILES[motif]}
          </pattern>
        </defs>
        <rect width="100%" height="16" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
