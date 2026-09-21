// Best-effort text-to-colour mapping so a frame-design swatch actually looks
// like the finish it names, without needing a new backend field for a real
// colour value. Unrecognised names fall back to a neutral grey swatch with
// the label still readable via the tooltip/aria-label.
const KNOWN_COLOURS: Record<string, string> = {
  black: '#1A1A1A',
  white: '#F5F5F0',
  brown: '#6B4226',
  gold: '#C9A227',
  silver: '#B8B8B8',
  natural: '#C8A876',
  'natural wood edge': '#C8A876',
  clear: '#E8ECE9',
  'vintage brown': '#5C3A21',
  walnut: '#5A3825',
  oak: '#C19A6B',
};

function swatchColour(label: string): string {
  const key = label.trim().toLowerCase();
  if (KNOWN_COLOURS[key]) return KNOWN_COLOURS[key];
  const match = Object.keys(KNOWN_COLOURS).find((k) => key.includes(k));
  return match ? KNOWN_COLOURS[match] : '#9A9A9A';
}

interface SwatchProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function Swatch({ label, active, onClick }: SwatchProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-full p-0.5 border transition-colors ${
        active ? 'border-accent' : 'border-transparent hover:border-line'
      }`}
    >
      <span
        className="block w-full h-full rounded-full border border-ink/10"
        style={{ backgroundColor: swatchColour(label) }}
      />
    </button>
  );
}
