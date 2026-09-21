import { dpiTier } from '@bro-pics/shared';

// Olive for good, the accent gold for the amber tier (with ink on it —
// the gold is far too light to carry white), and the warm alert red for a
// resolution that will visibly disappoint in print.
const TIER_CONFIG = {
  green: { label: 'Good quality print', className: 'bg-accent text-paper' },
  amber: { label: 'Lower quality print', className: 'bg-gold text-ink' },
  red: { label: 'Too low resolution for a sharp print', className: 'bg-alert text-paper' },
} as const;

export function DpiBadge({ effectiveDpi }: { effectiveDpi: number }) {
  const tier = dpiTier(effectiveDpi);
  const config = TIER_CONFIG[tier];

  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
