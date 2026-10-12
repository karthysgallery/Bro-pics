interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** A short second line shown beside the label (e.g. the paper name "A4"). */
  hint?: string;
}

export function Chip({ label, active, onClick, hint }: ChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={hint ? label : undefined}
      title={hint ? `${label} · ${hint}` : undefined}
      className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${active
          ? 'bg-ink text-paper border-ink'
          : 'bg-paper text-ink/70 border-line hover:border-gold hover:text-ink'
        }`}
    >
      {label}
      {hint && <span className={`ml-1.5 text-xs font-semibold ${active ? 'text-gold' : 'text-ink/45'}`}>{hint}</span>}
    </button>
  );
}
