import type { ThemeDecor } from '@bro-pics/shared';

/** Akash kandil: a star-shaped paper lantern with a warm glow and tassels. */
function Lantern({ hue }: { hue: number }) {
  const body = hue ? '#B91C1C' : 'rgb(var(--color-accent))';
  return (
    <svg width="54" height="92" viewBox="0 0 54 92">
      <defs>
        <radialGradient id={`kandil-glow-${hue}`} cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="27" cy="34" r="27" fill={`url(#kandil-glow-${hue})`} className="festive-glow" />
      <path d="M27 6 L44 22 L48 34 L44 46 L27 62 L10 46 L6 34 L10 22 Z" fill={body} />
      <path d="M27 6 L36 34 L27 62 L18 34 Z" fill="#F59E0B" />
      <path d="M6 34 H48" stroke="#FCD34D" strokeWidth="1.6" />
      <path d="M10 22 L44 46 M44 22 L10 46" stroke="#FCD34D" strokeWidth="0.8" opacity="0.7" />
      <circle cx="27" cy="34" r="4.5" fill="#FFF7D6" />
      {[18, 24, 30, 36].map((x, i) => (
        <path key={x} d={`M${x} 62 L${x + (i % 2 ? 1 : -1)} 86`} stroke={i % 2 ? '#F59E0B' : body} strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function Bauble({ hue }: { hue: number }) {
  const fill = hue ? 'rgb(var(--color-accent))' : 'rgb(var(--color-gold))';
  return (
    <svg width="44" height="54" viewBox="0 0 44 54">
      <rect x="17" y="0" width="10" height="7" rx="1.5" fill="#C9A24B" />
      <circle cx="22" cy="30" r="20" fill={fill} />
      <path d="M4 26 Q22 34 40 26" fill="none" stroke="rgb(var(--color-paper))" strokeWidth="2" opacity="0.7" />
      <path d="M5 33 Q22 41 39 33" fill="none" stroke="rgb(var(--color-paper))" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      <ellipse cx="14" cy="21" rx="5" ry="7" fill="#fff" opacity="0.35" transform="rotate(-25 14 21)" />
    </svg>
  );
}

function Star() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46">
      <circle cx="23" cy="24" r="20" fill="rgb(var(--color-gold))" opacity="0.18" className="festive-glow" />
      <path d="M23 3 L28.5 16.5 L43 17.5 L32 27 L35.5 41.5 L23 33.5 L10.5 41.5 L14 27 L3 17.5 L17.5 16.5 Z" fill="rgb(var(--color-gold))" stroke="rgb(var(--color-gold-deep))" strokeWidth="1.2" />
      <path d="M23 9 L26 18" stroke="#fff" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" />
    </svg>
  );
}

function Bell() {
  return (
    <svg width="46" height="56" viewBox="0 0 46 56">
      <path d="M9 6 Q15 12 23 8 Q31 12 37 6 Q33 16 23 13 Q13 16 9 6 Z" fill="#B91C1C" />
      <path d="M23 12 C 10 12, 10 34, 5 42 H41 C 36 34, 36 12, 23 12 Z" fill="rgb(var(--color-gold))" stroke="rgb(var(--color-gold-deep))" strokeWidth="1.2" />
      <circle cx="23" cy="46" r="4" fill="rgb(var(--color-gold-deep))" />
      <path d="M15 20 Q14 30 11 37" stroke="#fff" strokeWidth="2" opacity="0.45" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const STRINGS = [70, 120, 46];

/**
 * Ornaments hanging on threads at both edges of the page, swaying gently.
 * Only on screens wide enough to have empty margins beside the page, so they
 * never cover content or catch clicks.
 */
export function FestiveHanging({ hanging }: { hanging: ThemeDecor['hanging'] }) {
  if (hanging === 'none') return null;
  const ornament = (i: number) =>
    hanging === 'lanterns' ? <Lantern hue={i % 2} /> : hanging === 'baubles' ? <Bauble hue={i % 2} /> : hanging === 'stars' ? <Star /> : <Bell />;
  // Each side fills the empty margin beside the 1280px page, so nothing hangs over content.
  const side = (align: 'left' | 'right') => (
    <div className={`absolute top-0 flex w-[calc((100vw-1280px)/2)] justify-center gap-4 ${align === 'left' ? 'left-0' : 'right-0 flex-row-reverse'}`}>
      {STRINGS.map((len, i) => (
        <div
          key={i}
          className={`festive-swing flex-col items-center ${i === 2 ? 'hidden min-[1760px]:flex' : 'flex'}`}
          style={{ animationDelay: `${i * 0.7}s`, animationDuration: `${4 + i}s` }}
        >
          <span className="w-px bg-ink/40" style={{ height: len }} />
          {ornament(i)}
        </div>
      ))}
    </div>
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[5] hidden h-0 min-[1520px]:block">
      {side('left')}
      {side('right')}
    </div>
  );
}
