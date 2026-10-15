import Link from 'next/link';
import { isSafeHref, offerDaysLeft, type ThemeGreeting, type ThemeOffer } from '@bro-pics/shared';
import { OfferCode } from './OfferCode';

// Stars over the Deepavali sky: [x %, y %, size px].
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 12, 2], [11, 34, 1.5], [19, 8, 2.5], [27, 22, 1.5], [36, 6, 2], [44, 28, 1.5], [52, 12, 2], [58, 40, 1.5],
  [63, 6, 1.5], [71, 24, 2], [79, 10, 1.5], [86, 30, 2.5], [93, 14, 1.5], [97, 42, 2], [8, 52, 1.5], [48, 50, 1.5],
];

/** An agal vilakku: a clay lamp with painted dots and a flickering flame. */
function Diya({ index }: { index: number }) {
  const delay = `${0.35 + index * 0.12}s`;
  return (
    <span className="diya relative block h-11 w-14 sm:h-12 sm:w-16" style={{ animationDelay: delay }}>
      <span className="diya-glow absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/3 rounded-full" style={{ animationDelay: `${index * 0.37}s` }} />
      <svg viewBox="0 0 64 48" className="relative h-full w-full" aria-hidden="true">
        <path className="festive-flame" style={{ animationDelay: `${index * 0.23}s` }} d="M32 3 C39 13 39 21 32 25 C25 21 25 13 32 3 Z" fill="#FFB52E" />
        <path d="M32 11 C35 16 35 20 32 23 C29 20 29 16 32 11 Z" fill="#FFF3C4" />
        <path d="M5 26 Q32 52 59 26 Q46 31 32 31 Q18 31 5 26 Z" fill="#B5562B" />
        <path d="M5 26 Q18 31 32 31 Q46 31 59 26 Q46 27 32 27 Q18 27 5 26 Z" fill="#7A3417" />
        <path d="M59 26 L64 23 L60 29 Z" fill="#7A3417" />
        {[18, 25, 32, 39, 46].map((x) => (
          <circle key={x} cx={x} cy={37} r="1.6" fill="#FFE2A8" />
        ))}
        <path d="M14 33 Q32 42 50 33" fill="none" stroke="#FFE2A8" strokeWidth="1" strokeDasharray="1 3" />
      </svg>
    </span>
  );
}

/** 5 lamps on phones, 7 on tablets, all 13 on wide screens, always evenly spread. */
function diyaVisibility(i: number): string {
  const phone = i % 3 === 0;
  const tablet = i % 2 === 0;
  if (phone && tablet) return 'block';
  if (phone) return 'block sm:hidden lg:block';
  if (tablet) return 'hidden sm:block';
  return 'hidden lg:block';
}

function endsLine(offer: ThemeOffer): string {
  const days = offerDaysLeft(offer);
  if (days === 0) return 'Today is the last day of the offer.';
  if (days === 1) return 'Offer ends tomorrow.';
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${offer.endsOn}T00:00:00Z`));
  return `Offer ends ${date}, ${days} days left.`;
}

/**
 * Diwali's homepage banner: a Deepavali night where the offer hangs on the
 * wall as a gilded frame, lit from below by a row of diyas that light one
 * after another when the page opens.
 */
export function DiwaliNight({ greeting, offer }: { greeting: ThemeGreeting; offer: ThemeOffer | null }) {
  const href = greeting.ctaHref && isSafeHref(greeting.ctaHref) ? greeting.ctaHref : null;
  return (
    <section aria-label={greeting.title} className="mx-auto w-full max-w-shell px-4 pt-7 md:px-6 md:pt-8">
      <div className="diwali-night relative overflow-hidden rounded-[28px] text-[#FFF3DF]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {STARS.map(([x, y, s], i) => (
            <span
              key={i}
              className="festive-glow absolute rounded-full bg-[#FFE9B8]"
              style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${(i % 7) * 0.4}s` }}
            />
          ))}
        </div>

        <div className="relative grid items-center gap-5 px-6 pb-24 pt-6 sm:gap-8 sm:px-10 sm:pb-28 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-6 md:pt-12 lg:px-14">
          <div className="order-2 md:order-1">
            <p lang="ta" className="text-sm text-[#FFD27A] sm:text-base">
              தீபாவளி நல்வாழ்த்துகள்
            </p>
            <h2 className="diwali-title mt-2 font-[family-name:var(--font-cinzel)] text-[2.6rem] font-bold leading-[1.02] sm:text-6xl lg:text-7xl">
              {greeting.title}
            </h2>
            {greeting.subtitle && <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-[#FFF3DF]/85 md:text-lg">{greeting.subtitle}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {offer && <OfferCode code={offer.code} />}
              {greeting.ctaLabel && href && (
                <Link
                  href={href}
                  className="inline-flex h-12 items-center rounded-full bg-[#F5A30B] px-6 text-sm font-semibold text-[#2A0F0A] shadow-[0_8px_24px_-8px_rgba(245,163,11,0.7)] transition-colors hover:bg-[#FFB52E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD27A]"
                >
                  {greeting.ctaLabel}
                </Link>
              )}
            </div>
            {offer && <p className="mt-4 text-sm text-[#FFD27A]/85">{endsLine(offer)}</p>}
          </div>

          {/* The offer, framed and hung on the wall. */}
          <div aria-hidden={offer ? undefined : true} className="order-1 mx-auto w-[min(11rem,52%)] sm:w-[min(15rem,60%)] md:order-2 md:w-[min(20rem,100%)]">
            <div className="diwali-sway">
              <svg viewBox="0 0 200 54" className="mx-auto -mb-1 block w-3/5" aria-hidden="true">
                <path d="M100 6 L22 52 M100 6 L178 52" stroke="#C99A3E" strokeWidth="1.6" fill="none" />
                <circle cx="100" cy="6" r="4.5" fill="#E9C77A" stroke="#7A5A1E" />
              </svg>
              <div className="diwali-frame rounded-[6px] p-[10px] sm:p-3">
                <div className="rounded-[2px] bg-[#FFF3DF] p-3 sm:p-4">
                  <div className="diwali-picture relative flex aspect-[4/5] flex-col items-center justify-center overflow-hidden rounded-[1px] text-center">
                    {offer ? (
                      <>
                        <span className="sr-only">{`${offer.percentOff}% off everything with code ${offer.code}`}</span>
                        <span aria-hidden="true" className="font-[family-name:var(--font-cinzel)] text-[3rem] font-bold leading-none text-[#FFD27A] sm:text-[4.5rem] md:text-[5.5rem]">
                          {offer.percentOff}%
                        </span>
                        <span aria-hidden="true" className="mt-1 font-[family-name:var(--font-cinzel)] text-lg font-semibold tracking-[0.3em] text-[#FFF3DF] sm:text-2xl">
                          OFF
                        </span>
                        <span aria-hidden="true" className="mt-2 px-3 text-[11px] leading-snug text-[#FFF3DF]/80 sm:mt-3 sm:text-sm">
                          on everything in the shop
                        </span>
                      </>
                    ) : (
                      <span className="px-4 font-[family-name:var(--font-cinzel)] text-3xl font-bold leading-tight text-[#FFD27A]">Happy Deepavali</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The row of diyas along the bottom edge. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
          <div className="diwali-floor absolute inset-x-0 bottom-0 h-16" />
          <div className="relative flex items-end justify-around px-2 pb-2 sm:px-6">
            {Array.from({ length: 13 }, (_, i) => (
              <span key={i} className={diyaVisibility(i)}>
                <Diya index={i} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
