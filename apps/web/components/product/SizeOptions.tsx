'use client';

import { useEffect, useState } from 'react';
import { paperSizeName, type Variant } from '@bro-pics/shared';
import { formatPaise } from '../../lib/format-price';
import { mostLovedSize } from '../../lib/size-merchandising';
import { SizeChart } from './SizeChart';

interface SizeOptionsProps {
  /** Variants in the chosen orientation. */
  variants: Variant[];
  /** Size labels to offer, smallest first. */
  sizes: string[];
  selectedSize: string;
  selectedColour: string;
  onSelect: (size: string) => void;
  /** False inside a combo, where the combo price covers the frame. */
  showPrices?: boolean;
}

/** "A3 (12 × 18 inch)" or "10 × 10 inch". */
function sizeName(v: Pick<Variant, 'widthIn' | 'heightIn'>): { paper: string | null; inches: string } {
  return { paper: paperSizeName(v), inches: `${v.widthIn} × ${v.heightIn} inch` };
}

/**
 * The size choice with each size's own price next to it (the price of that size in the chosen frame, else its
 * lowest price), a "Most loved size" badge (A3, else the largest; a merchandising pick, not a statistic), and a
 * size chart in a sheet.
 */
export function SizeOptions({ variants, sizes, selectedSize, selectedColour, onSelect, showPrices = true }: SizeOptionsProps) {
  const [chartOpen, setChartOpen] = useState(false);
  const loved = mostLovedSize(variants.filter((v) => sizes.includes(v.sizeLabel)));

  useEffect(() => {
    if (!chartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setChartOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartOpen]);

  if (sizes.length === 0) return null;

  const rowFor = (size: string) => {
    const atSize = variants.filter((v) => v.sizeLabel === size);
    const inFrame = atSize.find((v) => v.frameColour === selectedColour);
    const pick = inFrame ?? [...atSize].sort((a, b) => a.price - b.price)[0];
    return { size, variant: pick, fromPrice: !inFrame && atSize.length > 1 };
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Size</p>
        <button type="button" onClick={() => setChartOpen(true)} className="text-xs font-medium text-ink/70 underline underline-offset-2 hover:text-ink">
          Size chart
        </button>
      </div>

      <div role="radiogroup" aria-label="Size" className="space-y-2.5">
        {sizes.map(rowFor).map(({ size, variant, fromPrice }) => {
          const on = size === selectedSize;
          const name = variant ? sizeName(variant) : { paper: null, inches: size };
          const price = variant?.price ?? null;
          const was = variant?.compareAtPrice && price !== null && variant.compareAtPrice > price ? variant.compareAtPrice : null;
          const off = was && price !== null ? Math.round(((was - price) / was) * 100) : 0;
          const isLoved = size === loved;
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(size)}
              className={`relative flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 text-left transition-colors ${isLoved ? 'pb-3 pt-4' : 'py-3'} ${
                on ? 'border-ink bg-[#f6d77a] text-ink shadow-sm' : 'border-line bg-paper text-ink hover:border-ink/40'
              }`}
            >
              {isLoved && (
                <span className="absolute -top-2.5 left-3 rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#f6d77a] shadow-sm">
                  Most loved size
                </span>
              )}
              <span className="min-w-0 text-[15px] font-semibold">
                {name.paper ? (
                  <>
                    {name.paper} <span className="whitespace-nowrap text-[13px] font-medium text-ink/75">({name.inches})</span>
                  </>
                ) : (
                  name.inches
                )}
              </span>
              {showPrices && price !== null && (
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {fromPrice && <span className="text-xs font-medium text-ink/60">from</span>}
                  <span className="text-base font-bold">{formatPaise(price)}</span>
                  {was && <span className="text-xs text-ink/50 line-through">{formatPaise(was)}</span>}
                  {off >= 5 && <span className={`hidden rounded px-1 text-[11px] font-semibold min-[400px]:inline ${on ? 'bg-ink/10 text-ink' : 'bg-emerald-50 text-emerald-700'}`}>{off}% off</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {chartOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Size chart" onClick={() => setChartOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-xl sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">Size chart</h2>
              <button type="button" onClick={() => setChartOpen(false)} aria-label="Close size chart" className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink hover:bg-tint">
                ×
              </button>
            </div>
            <SizeChart variants={variants} />
          </div>
        </div>
      )}
    </div>
  );
}
