import Image from 'next/image';
import Link from 'next/link';
import { comboSavings, expandComboFrames, type Combo } from '@bro-pics/shared';
import { formatPaise } from '../../lib/format-price';

/** A short row of combo offers for the homepage: a real internal link to each combo and to the full list. */
export function ComboOffersStrip({ combos }: { combos: Combo[] }) {
  if (combos.length === 0) return null;
  return (
    <section aria-labelledby="home-combos" className="mx-auto w-full max-w-shell px-4 md:px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <h2 id="home-combos" className="font-display text-2xl font-bold text-ink">Combo offers</h2>
        <Link href="/combos" className="text-sm font-semibold text-accent hover:text-accent-dark">See all combos</Link>
      </div>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {combos.slice(0, 3).map((combo) => {
          const savings = comboSavings(combo);
          return (
            <li key={combo.id}>
              <Link href={`/combo/${combo.slug}`} className="group block overflow-hidden rounded-2xl border border-line bg-paper transition-colors hover:border-gold">
                <div className="relative aspect-[4/3] bg-tint">
                  {combo.coverImageUrl && (
                    <Image
                      src={combo.coverImageUrl}
                      alt={combo.coverImageAlt || `${combo.name} — a set of personalized frames`}
                      fill
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                      unoptimized={combo.coverImageUrl.startsWith('/api/')}
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="p-4">
                  <p className="text-2xs uppercase tracking-eyebrow text-ink/55">{expandComboFrames(combo).length} frames</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-ink">{combo.name}</h3>
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-bold">{formatPaise(combo.price)}</span>
                    {savings.percent > 0 && <span className="ml-2 text-xs font-semibold text-accent">{savings.percent}% off</span>}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
