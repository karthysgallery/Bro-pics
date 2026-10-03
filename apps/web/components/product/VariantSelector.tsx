'use client';

import { Chip } from '../ui/Chip';
import { Swatch } from '../ui/Swatch';

interface VariantSelectorProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  display?: 'pill' | 'swatch';
}

export function VariantSelector({ label, options, selected, onSelect, display = 'pill' }: VariantSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <div className="mb-3">
      <span className="block text-xs text-ink/70 mb-1">
        {label}
        {display === 'swatch' && selected ? <span className="text-ink font-medium"> — {selected}</span> : null}
      </span>
      {/* pr-20 on mobile keeps the last wrapped pill clear of the fixed
          WhatsApp button (LayoutChrome renders it bottom-6 right-6 at
          w-14 h-14 -- roughly an 80px-from-the-edge footprint), which
          otherwise sits directly on top of a size/colour pill at common
          scroll positions and blocks taps on it. Not needed once the
          buy box sits in its own narrower column on wider viewports. */}
      <div className="flex flex-wrap gap-2">
        {options.map((option) =>
          display === 'swatch' ? (
            <Swatch key={option} label={option} active={option === selected} onClick={() => onSelect(option)} />
          ) : (
            <Chip key={option} label={option} active={option === selected} onClick={() => onSelect(option)} />
          )
        )}
      </div>
    </div>
  );
}
