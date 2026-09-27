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
  // [FE-30] minRating/inStockOnly were already understood end to end by
  // parseSearchFilters and the backend's own buildProductQueryPlan —
  // nothing here ever exposed a way to actually set them, so both are
  // optional and default to "not shown"/off rather than becoming a
  // required prop every existing FilterPanel caller/test would need to
  // update just to keep building.
  minRating?: number | null;
  onSetMinRating?: (minRating: number | null) => void;
  inStockOnly?: boolean;
  onToggleInStockOnly?: () => void;
}

const RATING_OPTIONS = [4, 3];

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
  minRating = null,
  onSetMinRating,
  inStockOnly = false,
  onToggleInStockOnly,
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

      {onSetMinRating && (
        <div>
          <h4 className="text-xs font-semibold text-ink/70 mb-2">Rating</h4>
          <div className="flex flex-wrap gap-2">
            {RATING_OPTIONS.map((rating) => (
              <Chip
                key={rating}
                label={`${rating}★ & up`}
                active={minRating === rating}
                onClick={() => onSetMinRating(minRating === rating ? null : rating)}
              />
            ))}
          </div>
        </div>
      )}

      {onToggleInStockOnly && (
        <div>
          <h4 className="text-xs font-semibold text-ink/70 mb-2">Availability</h4>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={inStockOnly} onChange={onToggleInStockOnly} />
            In stock only
          </label>
        </div>
      )}
    </div>
  );
}
