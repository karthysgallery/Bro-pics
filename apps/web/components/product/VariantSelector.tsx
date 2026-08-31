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
      <div className="flex flex-wrap gap-2">
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
