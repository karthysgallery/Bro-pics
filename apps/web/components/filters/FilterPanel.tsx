import { Chip } from '../ui/Chip';
import { Swatch } from '../ui/Swatch';

interface FilterPanelProps {
  availableSizes: string[];
  availableColours: string[];
  availableOrientations: string[];
  selectedSizes: string[];
  selectedColours: string[];
  selectedOrientations: string[];
  onToggleSize: (size: string) => void;
  onToggleColour: (colour: string) => void;
  onToggleOrientation: (orientation: string) => void;
  onClearAll: () => void;
}

const ORIENTATION_LABELS: Record<string, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  square: 'Square',
};

export function FilterPanel({
  availableSizes,
  availableColours,
  availableOrientations,
  selectedSizes,
  selectedColours,
  selectedOrientations,
  onToggleSize,
  onToggleColour,
  onToggleOrientation,
  onClearAll,
}: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Filters</h3>
        <button onClick={onClearAll} className="text-sm text-accent hover:text-accent-dark">
          Clear all
        </button>
      </div>

      {availableSizes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink/70 mb-2">Size</h4>
          <div className="flex flex-wrap gap-2">
            {availableSizes.map((size) => (
              <Chip key={size} label={size} active={selectedSizes.includes(size)} onClick={() => onToggleSize(size)} />
            ))}
          </div>
        </div>
      )}

      {availableOrientations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink/70 mb-2">Orientation</h4>
          <div className="flex flex-wrap gap-2">
            {availableOrientations.map((orientation) => (
              <Chip
                key={orientation}
                label={ORIENTATION_LABELS[orientation] ?? orientation}
                active={selectedOrientations.includes(orientation)}
                onClick={() => onToggleOrientation(orientation)}
              />
            ))}
          </div>
        </div>
      )}

      {availableColours.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink/70 mb-2">Frame design</h4>
          <div className="flex flex-wrap gap-3">
            {availableColours.map((colour) => (
              <Swatch
                key={colour}
                label={colour}
                active={selectedColours.includes(colour)}
                onClick={() => onToggleColour(colour)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
