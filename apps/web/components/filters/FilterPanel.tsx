interface FilterPanelProps {
  availableSizes: string[];
  availableColours: string[];
  selectedSizes: string[];
  selectedColours: string[];
  onToggleSize: (size: string) => void;
  onToggleColour: (colour: string) => void;
  onClearAll: () => void;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm border ${
        active ? 'bg-terracotta text-cream border-terracotta' : 'border-charcoal/20 text-charcoal'
      }`}
    >
      {label}
    </button>
  );
}

export function FilterPanel({
  availableSizes,
  availableColours,
  selectedSizes,
  selectedColours,
  onToggleSize,
  onToggleColour,
  onClearAll,
}: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Filters</h3>
        <button onClick={onClearAll} className="text-sm text-terracotta">
          Clear all
        </button>
      </div>

      {availableSizes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Size</h4>
          <div className="flex flex-wrap gap-2">
            {availableSizes.map((size) => (
              <Chip key={size} label={size} active={selectedSizes.includes(size)} onClick={() => onToggleSize(size)} />
            ))}
          </div>
        </div>
      )}

      {availableColours.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Colour</h4>
          <div className="flex flex-wrap gap-2">
            {availableColours.map((colour) => (
              <Chip
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
