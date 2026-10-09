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

export interface SwatchLook {
  /** A frame model's photo: the swatch shows a close-up of its corner. */
  imageUrl?: string;
  hex?: string;
  borderPx?: number;
  widthPx?: number;
}

interface SwatchProps {
  label: string;
  active: boolean;
  onClick: () => void;
  look?: SwatchLook;
}

export function Swatch({ label, active, onClick, look }: SwatchProps) {
  if (look?.imageUrl) {
    // The frame's top-left corner, magnified so the moulding fills the tile.
    const zoom = look.borderPx && look.widthPx ? Math.min(8, Math.max(2, (look.widthPx / look.borderPx) * 0.55)) : 3;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`h-12 w-12 overflow-hidden rounded-lg border-2 p-0.5 transition-colors ${active ? 'border-accent' : 'border-line hover:border-ink/40'}`}
      >
        <span
          className="block h-full w-full rounded-md"
          style={{ backgroundImage: `url("${look.imageUrl.replace(/w=\d+/, 'w=400')}")`, backgroundSize: `${zoom * 100}%`, backgroundPosition: '0 0', backgroundColor: look.hex }}
        />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-full p-0.5 border transition-colors ${active ? 'border-accent' : 'border-transparent hover:border-line'
        }`}
    >
      <span
        className="block w-full h-full rounded-full border border-ink/10"
        style={{ backgroundColor: look?.hex ?? swatchColour(label) }}
      />
    </button>
  );
}
