import { dpiTier } from '@bro-pics/shared';

const TIER_CONFIG = {
  green: { label: 'Good quality print', className: 'bg-sage text-cream' },
  amber: { label: 'Lower quality print', className: 'bg-terracotta text-cream' },
  red: { label: 'Too low resolution for a sharp print', className: 'bg-charcoal text-cream' },
} as const;

export function DpiBadge({ effectiveDpi }: { effectiveDpi: number }) {
  const tier = dpiTier(effectiveDpi);
  const config = TIER_CONFIG[tier];

  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs ${config.className}`}>
      {config.label}
    </span>
  );
}
