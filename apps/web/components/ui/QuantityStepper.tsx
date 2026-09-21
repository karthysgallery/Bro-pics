interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  label?: string;
}

export function QuantityStepper({ value, onChange, min = 1, label = 'Quantity' }: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-paper" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="w-9 h-9 flex items-center justify-center text-ink/70 hover:text-accent disabled:opacity-30 disabled:hover:text-ink/70"
      >
        &minus;
      </button>
      <span className="w-8 text-center text-sm font-medium tabular-nums" data-testid="quantity-value">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className="w-9 h-9 flex items-center justify-center text-ink/70 hover:text-accent"
      >
        +
      </button>
    </div>
  );
}
