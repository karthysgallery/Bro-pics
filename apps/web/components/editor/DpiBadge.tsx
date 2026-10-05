import { dpiTier } from '@bro-pics/shared';

// Olive for good, the accent gold for the amber tier (with ink on it —
// the gold is far too light to carry white), and the warm alert red for a
// resolution that will visibly disappoint in print.
const TIER_CONFIG = {
  green: { dpi: '300+ DPI · Ultra Sharp', label: 'Good quality print', className: 'bg-emerald-700 text-white' },
  amber: { dpi: '150–299 DPI · Good Quality', label: 'Lower quality print', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  red: { dpi: 'Below 150 DPI · Low Resolution', label: 'Too low resolution for a sharp print', className: 'bg-rose-100 text-rose-800 border border-rose-300' },
} as const;

export function DpiBadge({ effectiveDpi }: { effectiveDpi: number }) {
  const tier = dpiTier(effectiveDpi);
  const config = TIER_CONFIG[tier];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      <span className="font-semibold">{config.dpi}</span>
      <span className="opacity-70">·</span>
      <span>{config.label}</span>
    </span>
  );
}
