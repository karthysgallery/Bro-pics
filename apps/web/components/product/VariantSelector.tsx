'use client';

interface VariantSelectorProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

export function VariantSelector({ label, options, selected, onSelect }: VariantSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <div className="mb-3">
      <span className="block text-xs text-charcoal/70 mb-1">{label}</span>
      {/* pr-20 on mobile keeps the last wrapped pill clear of the fixed
          WhatsApp button (LayoutChrome renders it bottom-6 right-6 at
          w-14 h-14 -- roughly an 80px-from-the-edge footprint), which
          otherwise sits directly on top of a size/colour pill at common
          scroll positions and blocks taps on it. Not needed once the
          buy box sits in its own narrower column on wider viewports. */}
      <div className="flex flex-wrap gap-2 pr-20 sm:pr-0">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            aria-pressed={option === selected}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              option === selected
                ? 'bg-terracotta text-cream border-terracotta'
                : 'bg-surface text-charcoal border-charcoal/20'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
