import Image from 'next/image';
import type { ClipartOption } from '@bro-pics/shared';

interface ClipartPickerProps {
  options: ClipartOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// Grid of clipart thumbnails, same visual pattern as Swatch/SlotPicker.
// Selecting the already-selected option clears it (clipart is optional).
export function ClipartPicker({ options, selectedId, onSelect }: ClipartPickerProps) {
  if (options.length === 0) return null;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <span className="block text-sm font-semibold text-ink mb-3">Add a clipart (optional)</span>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Clipart">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selectedId === option.id}
            onClick={() => onSelect(selectedId === option.id ? null : option.id)}
            className="flex flex-col items-center gap-1.5 w-16 group"
          >
            <span
              className={`w-14 h-14 rounded-xl border flex items-center justify-center bg-paper transition-all ${
                selectedId === option.id
                  ? 'border-ink bg-tint/50 ring-1 ring-ink shadow-xs'
                  : 'border-line/80 hover:border-ink/40'
              }`}
            >
              <Image src={option.assetUrl} alt="" width={28} height={28} className="object-contain" />
            </span>
            <span className="text-xs text-ink/70 text-center leading-tight truncate w-full font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
