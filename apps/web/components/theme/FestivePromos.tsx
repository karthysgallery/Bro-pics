import Link from 'next/link';
import { isSafeHref, type ThemePromo } from '@bro-pics/shared';

const TONES: Record<ThemePromo['tone'], { card: string; link: string; kolam: string }> = {
  kumkum: { card: 'bg-[#8E1630] text-[#FFF3DF]', link: 'text-[#FFD27A]', kolam: '#FFD27A' },
  marigold: { card: 'bg-[#F5A30B] text-[#2A0F0A]', link: 'text-[#5A0E22]', kolam: '#8E1630' },
  night: { card: 'bg-[#2A0D2E] text-[#FFF3DF]', link: 'text-[#FFD27A]', kolam: '#F5A30B' },
};

/** A corner of a kolam: the dot grid with a looped line drawn around each dot. */
function KolamCorner({ color }: { color: string }) {
  const dots = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => [20 + c * 22, 20 + r * 22] as const));
  return (
    <svg viewBox="0 0 110 110" className="h-full w-full" aria-hidden="true">
      {dots.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="1.8" fill={color} />
          <rect x={x - 8} y={y - 8} width="16" height="16" rx="6" fill="none" stroke={color} strokeWidth="1.2" transform={`rotate(45 ${x} ${y})`} />
        </g>
      ))}
    </svg>
  );
}

/** The festival's gift banners under the homepage hero: who each gift is for, and where to find it. */
export function FestivePromos({ promos, festival }: { promos: ThemePromo[]; festival: string }) {
  const shown = promos.filter((p) => isSafeHref(p.href));
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="festive-promos-title" className="mx-auto w-full max-w-shell px-4 pt-6 md:px-6 md:pt-8">
      <h2 id="festive-promos-title" className="font-display text-lg font-bold text-ink md:text-xl">
        Find a {festival} gift
      </h2>
      <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
        {shown.map((promo) => {
          const tone = TONES[promo.tone];
          return (
            <Link
              key={promo.href + promo.title}
              href={promo.href}
              className={`group relative flex min-h-[164px] w-[78%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[20px] p-5 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-[46%] md:w-auto md:p-6 ${tone.card}`}
            >
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 opacity-40 transition-opacity group-hover:opacity-70">
                <KolamCorner color={tone.kolam} />
              </span>
              <span className="relative max-w-[16rem]">
                <span className="block font-display text-xl font-bold leading-tight md:text-2xl">{promo.title}</span>
                {promo.subtitle && <span className="mt-2 block text-sm leading-snug opacity-85">{promo.subtitle}</span>}
              </span>
              <span className={`relative mt-4 text-sm font-semibold underline decoration-2 underline-offset-4 ${tone.link}`}>Shop now</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
