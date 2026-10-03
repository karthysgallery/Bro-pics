/**
 * Single source of truth for the font key → human label → file name mapping.
 * Consumed by:
 *   - apps/web/lib/text-personalization-options.ts   (storefront picker)
 *   - services/print-render/src/render-text.ts       (300 DPI SVG renderer)
 *
 * The `ttfFilename` is relative to whichever fonts directory the consumer
 * keeps — the client doesn't need it (it uses CSS custom properties), but
 * the print renderer resolves it against its own bundled `fonts/` folder.
 *
 * ALL FONTS LISTED HERE ARE GOOGLE FONTS RELEASED UNDER THE OFL (SIL OPEN
 * FONT LICENSE) — free to bundle and redistribute.
 */

export interface FontEntry {
  /** Stable key stored in Customization.textFieldsJson[field].fontFamily via
   *  the CSS-var indirection the client uses. Must never change for an
   *  existing font (old customizations reference it). */
  key: string;
  /** Human-readable name shown in the picker. */
  label: string;
  /** CSS custom property name (set by next/font on <html>). */
  cssVariable: string;
  /** Filename of the bundled TTF in services/print-render/fonts/. */
  ttfFilename: string;
}

export const FONT_MAP: readonly FontEntry[] = [
  { key: 'dancing-script', label: 'Dancing Script', cssVariable: '--font-dancing-script', ttfFilename: 'DancingScript-Regular.ttf' },
  { key: 'great-vibes', label: 'Great Vibes', cssVariable: '--font-great-vibes', ttfFilename: 'GreatVibes-Regular.ttf' },
  { key: 'pacifico', label: 'Pacifico', cssVariable: '--font-pacifico', ttfFilename: 'Pacifico-Regular.ttf' },
  { key: 'sacramento', label: 'Sacramento', cssVariable: '--font-sacramento', ttfFilename: 'Sacramento-Regular.ttf' },
  { key: 'cormorant', label: 'Cormorant', cssVariable: '--font-cormorant', ttfFilename: 'Cormorant-Regular.ttf' },
  { key: 'cinzel', label: 'Cinzel', cssVariable: '--font-cinzel', ttfFilename: 'Cinzel-Regular.ttf' },
  { key: 'caveat', label: 'Caveat', cssVariable: '--font-caveat', ttfFilename: 'Caveat-Regular.ttf' },
  { key: 'josefin', label: 'Josefin Sans', cssVariable: '--font-josefin', ttfFilename: 'JosefinSans-Regular.ttf' },
] as const;

/**
 * Fallback fonts bundled for non-Latin scripts. The renderer tries each in
 * order after the primary font fails to cover a codepoint.
 *
 * Coverage:
 *   - NotoSansTamil:      Tamil script
 *   - NotoSansDevanagari: Hindi, Marathi, Sanskrit, and other Devanagari-script languages
 *
 * These are NOT offered in the customer picker (they're utilitarian, not
 * decorative) — they exist purely so text containing Tamil or Devanagari
 * characters renders correctly on the print file rather than showing
 * tofu (□) boxes.
 */
export const FALLBACK_FONTS: readonly { label: string; ttfFilename: string }[] = [
  { label: 'Noto Sans Tamil', ttfFilename: 'NotoSansTamil-Regular.ttf' },
  { label: 'Noto Sans Devanagari', ttfFilename: 'NotoSansDevanagari-Regular.ttf' },
] as const;

/** Look up a FontEntry by its key. Returns undefined for unknown keys. */
export function fontEntryForKey(key: string): FontEntry | undefined {
  return FONT_MAP.find((f) => f.key === key);
}

/** Recover a font key from a stored CSS var string like `var(--font-dancing-script)`. */
export function fontKeyFromCssVar(cssVar: string): string | undefined {
  return FONT_MAP.find((f) => `var(${f.cssVariable})` === cssVar)?.key;
}
