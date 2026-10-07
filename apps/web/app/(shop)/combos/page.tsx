import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { comboSavings, expandComboFrames } from '@bro-pics/shared';
import { getPublishedCombos } from '../../../lib/firestore-combos';
import { formatPaise } from '../../../lib/format-price';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Combo offers | KarthysGallery',
  description: 'Sets of personalized frames at one price. Pick a combo, then design each frame with your own photos.',
  alternates: { canonical: '/combos' },
};

export default async function CombosPage() {
  const combos = await getPublishedCombos().catch(() => []);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-8">
      <h1 className="font-display text-3xl font-bold text-ink">Combo offers</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/70">A set of frames at one price. You design every frame with your own photos.</p>

      {combos.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-sm text-ink/70">No combo offers right now.</p>
          <Link href="/category" className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-dark">Shop all frames</Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {combos.map((combo) => {
            const savings = comboSavings(combo);
            const frameCount = expandComboFrames(combo).length;
            return (
              <li key={combo.id}>
                <Link href={`/combo/${combo.slug}`} className="group block overflow-hidden rounded-3xl border border-line bg-paper transition-colors hover:border-gold">
                  <div className="relative aspect-[4/3] bg-tint">
                    {combo.coverImageUrl && (
                      <Image src={combo.coverImageUrl} alt={combo.coverImageAlt || combo.name} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" unoptimized={combo.coverImageUrl.startsWith('/api/')} className="object-cover" />
                    )}
                    {combo.badge && <span className="absolute left-3 top-3 rounded-full bg-[#FDE68A] px-3 py-1 text-xs font-semibold text-[#92400E]">{combo.badge}</span>}
                  </div>
                  <div className="p-4">
                    <p className="text-2xs uppercase tracking-eyebrow text-ink/55">{frameCount} frames</p>
                    <h2 className="mt-1 font-display text-lg font-bold text-ink">{combo.name}</h2>
                    <div className="mt-2 flex flex-wrap items-baseline gap-2">
                      <span className="text-lg font-bold text-ink">{formatPaise(combo.price)}</span>
                      {combo.mrp > combo.price && <span className="text-sm text-ink/45 line-through">{formatPaise(combo.mrp)}</span>}
                      {savings.percent > 0 && <span className="text-xs font-semibold text-accent">{savings.percent}% off</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
