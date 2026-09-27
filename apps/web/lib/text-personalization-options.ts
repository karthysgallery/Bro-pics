// Curated font and colour choices for the personalization editor's text
// fields (Name/Date-style fields) — mirrors the reference site's "Style
// 1..10" font grid and swatch-based colour picker, sized down to a
// deliberately small, on-brand set rather than trying to match their count.
export interface TextFontOption {
  key: string;
  label: string;
  cssVariable: string;
}

export const TEXT_FONT_OPTIONS: TextFontOption[] = [
  { key: 'dancing-script', label: 'Dancing Script', cssVariable: '--font-dancing-script' },
  { key: 'great-vibes', label: 'Great Vibes', cssVariable: '--font-great-vibes' },
  { key: 'pacifico', label: 'Pacifico', cssVariable: '--font-pacifico' },
  { key: 'sacramento', label: 'Sacramento', cssVariable: '--font-sacramento' },
  { key: 'cormorant', label: 'Cormorant', cssVariable: '--font-cormorant' },
  { key: 'cinzel', label: 'Cinzel', cssVariable: '--font-cinzel' },
  { key: 'caveat', label: 'Caveat', cssVariable: '--font-caveat' },
  { key: 'josefin', label: 'Josefin Sans', cssVariable: '--font-josefin' },
];

export const DEFAULT_TEXT_FONT_KEY = TEXT_FONT_OPTIONS[0].key;

export function fontFamilyForKey(key: string): string {
  const option = TEXT_FONT_OPTIONS.find((f) => f.key === key) ?? TEXT_FONT_OPTIONS[0];
  return `var(${option.cssVariable})`;
}

// [FE-16] The inverse of fontFamilyForKey — recovers the picker's own
// selected-font state (a key) from a stored Customization's
// textFieldsJson, which only ever persists the resolved fontFamily
// string, never the key. Falls back to the default key for a value this
// list no longer recognizes (a font retired since the customization was
// saved) rather than leaving the picker with no selection at all.
export function fontKeyForFamily(fontFamily: string): string {
  return TEXT_FONT_OPTIONS.find((f) => `var(${f.cssVariable})` === fontFamily)?.key ?? DEFAULT_TEXT_FONT_KEY;
}

// Canvas 2D's `font` property does not understand CSS custom properties
// like `var(--x)` — it needs the actual resolved font-family name.
// next/font/google writes that
// resolved (obfuscated, e.g. "__Dancing_Script_abc123") name as the custom
// property's VALUE on <html>, so reading it via getComputedStyle recovers
// a name Canvas can use. Falls back to a generic family if called during
// SSR or before the stylesheet has applied.
export function resolveFontFamilyForCanvas(key: string): string {
  const option = TEXT_FONT_OPTIONS.find((f) => f.key === key) ?? TEXT_FONT_OPTIONS[0];
  if (typeof window === 'undefined') return 'serif';
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(option.cssVariable).trim();
  return resolved || 'serif';
}

export interface TextColorOption {
  key: string;
  label: string;
  value: string;
}

export const TEXT_COLOR_OPTIONS: TextColorOption[] = [
  { key: 'charcoal', label: 'Charcoal', value: '#2b2420' },
  { key: 'cream', label: 'Cream', value: '#fbf7ef' },
  { key: 'gold', label: 'Gold', value: '#c9a24b' },
  { key: 'brown', label: 'Brown', value: '#5a3d2b' },
  { key: 'terracotta', label: 'Terracotta', value: '#c1592a' },
];

export const DEFAULT_TEXT_COLOR = TEXT_COLOR_OPTIONS[0].value;

export const MAX_TEXT_FIELD_LENGTH = 40;

// Placeholder default text-zone position (fraction rect, matching
// FrameTemplate.printableRects' own convention) used until FrameTemplate
// gains a real per-template `textZones` field (see the Phase 2 backend
// requirements doc) — every text field gets an equal-height band stacked
// inside a fixed strip near the bottom of the mockup, so multiple fields
// (e.g. Name + Date) don't overlap.
export function defaultTextZoneRect(fieldIndex: number, totalFields: number): { x: number; y: number; width: number; height: number } {
  const stripTop = 0.84;
  const stripHeight = 0.13;
  const bandHeight = stripHeight / Math.max(totalFields, 1);
  return {
    x: 0.08,
    width: 0.84,
    y: stripTop + bandHeight * fieldIndex,
    height: bandHeight,
  };
}
