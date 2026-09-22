interface SlotPickerProps {
  slotCount: number;
  activeSlotIndex: number;
  filledSlots: Set<number>;
  onSelectSlot: (slotIndex: number) => void;
}

export function SlotPicker({ slotCount, activeSlotIndex, filledSlots, onSelectSlot }: SlotPickerProps) {
  if (slotCount <= 1) return null;

  return (
    <div className="rail flex gap-2 overflow-x-auto py-2">
      {Array.from({ length: slotCount }, (_, slotIndex) => (
        <button
          key={slotIndex}
          onClick={() => onSelectSlot(slotIndex)}
          aria-pressed={slotIndex === activeSlotIndex}
          aria-label={`Slot ${slotIndex + 1}`}
          className={`w-11 h-11 flex-shrink-0 rounded-lg border text-sm font-semibold transition-colors ${
            slotIndex === activeSlotIndex
              ? 'bg-gold text-ink border-gold'
              : 'bg-paper text-ink border-line hover:border-gold'
          }`}
        >
          {filledSlots.has(slotIndex) ? '✓' : slotIndex + 1}
        </button>
      ))}
    </div>
  );
}
