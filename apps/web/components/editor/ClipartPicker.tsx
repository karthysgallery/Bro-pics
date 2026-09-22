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
    <div className="mt-4 border-t border-line pt-4">
      <span className="block text-sm font-medium text-ink mb-2">Add a clipart (optional)</span>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Clipart">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selectedId === option.id}
            onClick={() => onSelect(selectedId === option.id ? null : option.id)}
            className="flex flex-col items-center gap-1 w-16"
          >
            <span
              className={`w-14 h-14 rounded-md border flex items-center justify-center bg-paper transition-colors ${
                selectedId === option.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <Image src={option.assetUrl} alt="" width={32} height={32} />
            </span>
            <span className="text-2xs text-ink/60 text-center leading-tight truncate w-full">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
