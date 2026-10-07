import { dpiTier, DEFAULT_MIN_DPI, DEFAULT_RECOMMENDED_DPI, type DpiThresholds } from '@bro-pics/shared';

// Olive for good, the accent gold for the amber tier (with ink on it —
// the gold is far too light to carry white), and the warm alert red for a
// resolution that will visibly disappoint in print.
const TIER_STYLE = {
  green: { label: 'Good quality print', className: 'bg-emerald-700 text-white' },
  amber: { label: 'Lower quality print', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  red: { label: 'Too low resolution for a sharp print', className: 'bg-rose-100 text-rose-800 border border-rose-300' },
} as const;

/** `thresholds` is the slot's own requirement (defaults 150 / 300) so the badge matches the Add-to-cart check. */
export function DpiBadge({ effectiveDpi, thresholds }: { effectiveDpi: number; thresholds?: DpiThresholds }) {
  const tier = dpiTier(effectiveDpi, thresholds);
  const min = thresholds?.minDpi ?? DEFAULT_MIN_DPI;
  const recommended = thresholds?.recommendedDpi ?? DEFAULT_RECOMMENDED_DPI;
  const dpiText =
    tier === 'green' ? `${recommended}+ DPI · Ultra Sharp` : tier === 'amber' ? `${min}–${recommended - 1} DPI · Good Quality` : `Below ${min} DPI · Low Resolution`;
  const config = TIER_STYLE[tier];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      <span className="font-semibold">{dpiText}</span>
      <span className="opacity-70">·</span>
      <span>{config.label}</span>
    </span>
  );
}
