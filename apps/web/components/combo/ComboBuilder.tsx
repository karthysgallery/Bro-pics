'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { comboSavings, expandComboFrames, type Combo } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { buildComboCartLine, clearComboDraft, draftProgress, loadComboDraft, type ComboDraft } from '../../lib/combo-draft';
import { formatPaise } from '../../lib/format-price';
import type { ComboItemCard } from '../../lib/firestore-combo-detail';
import { StorageImage } from '../ui/StorageImage';
import { Button } from '../ui/Button';

interface ComboBuilderProps {
  combo: Combo;
  cards: ComboItemCard[];
}

/** The combo page body: what is included, each frame's status, and the one button that adds it all. */
export function ComboBuilder({ combo, cards }: ComboBuilderProps) {
  const { addItem } = useCart();
  // Read after mount so the server render and the first client paint agree.
  const [draft, setDraft] = useState<ComboDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setDraft(loadComboDraft(combo));
    setLoaded(true);
  }, [combo]);

  const frames = useMemo(() => expandComboFrames(combo), [combo]);
  const progress = draftProgress(combo, draft);
  const savings = comboSavings(combo);
  const cardByItem = new Map(cards.map((c) => [c.itemId, c]));
  const unavailable = combo.items.filter((i) => !cardByItem.get(i.id)?.inStock);
  const remaining = progress.total - progress.doneCount;
  const canAdd = loaded && progress.ready && unavailable.length === 0 && draft !== null;

  const handleAdd = () => {
    if (!canAdd || !draft) return;
    const line = buildComboCartLine(combo, draft);
    if (!line) return;
    addItem(line);
    clearComboDraft(combo.id);
    setDraft(null);
    setAdded(true);
    window.dispatchEvent(new CustomEvent('karthys:open-cart'));
  };

  const startOver = () => {
    clearComboDraft(combo.id);
    setDraft(null);
    setAdded(false);
  };

  const reason = !loaded || added
    ? ''
    : unavailable.length > 0
      ? `${cardByItem.get(unavailable[0]!.id)?.label ?? 'A frame'} is not available right now.`
      : remaining > 0
        ? `Personalize ${remaining} more ${remaining === 1 ? 'frame' : 'frames'} to continue.`
        : '';

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 items-center">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-tint border border-line/70">
          {combo.coverImageUrl && (
            <Image
              src={combo.coverImageUrl}
              alt={combo.coverImageAlt || combo.name}
              fill
              priority
              unoptimized={combo.coverImageUrl.startsWith('/api/')}
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover"
            />
          )}
          {combo.badge && (
            <span className="absolute left-4 top-4 rounded-full bg-[#FDE68A] px-3 py-1 text-xs font-semibold text-[#92400E]">{combo.badge}</span>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-2xs uppercase tracking-eyebrow text-ink/60">Combo offer · {progress.total} frames</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-ink">{combo.name}</h1>
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-display text-3xl font-bold text-ink">{formatPaise(combo.price)}</span>
              {combo.mrp > combo.price && <span className="text-base text-ink/45 line-through">{formatPaise(combo.mrp)}</span>}
            </div>
            {savings.amount > 0 && (
              <p className="mt-1 text-sm font-semibold text-accent">
                You save {formatPaise(savings.amount)} ({savings.percent}% off)
              </p>
            )}
            <p className="mt-1 text-xs text-ink/55">One price for all {progress.total} frames, inclusive of taxes.</p>
          </div>
          {combo.description && <p className="whitespace-pre-line text-sm text-ink/75 leading-relaxed">{combo.description}</p>}
          <a href="#frames" className="inline-flex h-12 w-fit items-center rounded-full bg-gold px-7 text-sm font-semibold text-ink transition-colors hover:bg-gold-deep">
            {progress.doneCount === 0 ? 'Start personalizing' : 'Continue personalizing'}
          </a>
        </div>
      </section>

      {/* What's included */}
      <section aria-labelledby="included-heading">
        <h2 id="included-heading" className="font-display text-xl font-bold text-ink">What&apos;s included</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {combo.items.map((item) => {
            const card = cardByItem.get(item.id);
            return (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-line bg-paper">
                <div className="relative aspect-square bg-tint">
                  {card?.imageUrl && <Image src={card.imageUrl} alt={card.imageAlt} fill sizes="(min-width: 1024px) 22vw, 45vw" className="object-cover" />}
                  <span className="absolute right-2 top-2 rounded-full bg-ink px-2.5 py-1 text-2xs font-semibold text-paper">× {item.quantity}</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-ink line-clamp-2">{card?.label ?? item.label ?? 'Frame'}</p>
                  <p className="mt-0.5 text-2xs text-ink/60">{card?.variantLabel ?? 'No longer available'}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Frames to personalize */}
      <section id="frames" aria-labelledby="frames-heading" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="frames-heading" className="font-display text-xl font-bold text-ink">Personalize your frames</h2>
            <p className="mt-1 text-sm text-ink/65">Each frame is designed on its own. Open one, add your photos, and save it.</p>
          </div>
          <p className="text-sm font-semibold text-ink" aria-live="polite">
            {progress.doneCount} of {progress.total} done
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-tint" role="progressbar" aria-label="Frames personalized" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.doneCount}>
          <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progress.total ? (progress.doneCount / progress.total) * 100 : 0}%` }} />
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {frames.map((frame) => {
            const card = cardByItem.get(frame.itemId);
            const saved = draft?.frames[frame.key];
            const done = Boolean(saved);
            return (
              <li key={frame.key} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-tint">
                  {saved?.previewPath ? (
                    <StorageImage path={saved.previewPath} alt={`${frame.label} preview`} fill sizes="80px" className="object-cover" fallback={<div className="h-full w-full bg-tint" />} />
                  ) : (
                    card?.imageUrl && <Image src={card.imageUrl} alt={card.imageAlt} fill sizes="80px" className="object-cover opacity-80" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{frame.label}</p>
                  <p className="truncate text-2xs text-ink/60">{card ? `${card.label} · ${card.variantLabel}` : 'No longer available'}</p>
                  <p className={`mt-1 text-xs font-semibold ${done ? 'text-accent' : 'text-alert'}`}>
                    {done ? `✓ ${frame.label} completed` : `⚠ ${frame.label}: add photos`}
                  </p>
                </div>
                <Link
                  href={`/combo/${combo.slug}/frame/${frame.key}`}
                  className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors ${done ? 'border border-line text-ink hover:border-gold' : 'bg-gold text-ink hover:bg-gold-deep'}`}
                >
                  {done ? 'Edit' : 'Customize'}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Summary and checkout */}
      <section id="summary" aria-labelledby="summary-heading" className="scroll-mt-24 rounded-3xl border border-line bg-paper p-5 md:p-6">
        <h2 id="summary-heading" className="font-display text-xl font-bold text-ink">Your combo</h2>
        <dl className="mt-3 grid gap-1 text-sm text-ink/75">
          <div className="flex justify-between"><dt>Frames personalized</dt><dd className="font-semibold text-ink">{progress.doneCount} of {progress.total}</dd></div>
          <div className="flex justify-between"><dt>Combo price</dt><dd className="font-semibold text-ink">{formatPaise(combo.price)}</dd></div>
          {savings.amount > 0 && <div className="flex justify-between"><dt>You save</dt><dd className="font-semibold text-accent">{formatPaise(savings.amount)}</dd></div>}
        </dl>
        {reason && <p className="mt-3 text-xs text-ink/65">{reason}</p>}
        {added && <p className="mt-3 text-xs font-semibold text-accent">Added to your cart.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleAdd} disabled={!canAdd} className="h-12 w-full sm:w-auto sm:min-w-64">
            Add complete combo to cart
          </Button>
          {draft && progress.doneCount > 0 && (
            <button type="button" onClick={startOver} className="text-sm text-ink/60 underline underline-offset-2 hover:text-ink">
              Start over
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
