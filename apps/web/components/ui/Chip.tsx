interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
        active
          ? 'bg-ink text-paper border-ink'
          : 'bg-paper text-ink/70 border-line hover:border-gold hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
