export type Orientation = 'portrait' | 'landscape' | 'square';

// Frontend-only derivation — no backend field exists for orientation yet
// (see docs/superpowers/specs/2026-09-14-frames-only-backend-changes.md).
// Prefers real width/height when available; falls back to parsing the
// "WxH" pattern out of a sizeLabel string (e.g. "8x12 in") for contexts
// that only have the denormalized label, like the category listing page.
export function orientationFromDimensions(widthIn: number, heightIn: number): Orientation {
  if (Math.abs(widthIn - heightIn) < 0.01) return 'square';
  return widthIn > heightIn ? 'landscape' : 'portrait';
}

export function orientationFromSizeLabel(sizeLabel: string): Orientation | null {
  const match = sizeLabel.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return orientationFromDimensions(Number(match[1]), Number(match[2]));
}
