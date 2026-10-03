import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FONT_MAP, FALLBACK_FONTS, fontEntryForKey, fontKeyFromCssVar, type FontEntry } from '@bro-pics/shared';
import { fitTextToZone, type TextFitResult } from '@bro-pics/shared';
import { fractionRectToCanvasRect, type Rect } from '@bro-pics/shared';

/**
 * Directory containing the bundled .ttf font files. Resolved relative to
 * this module's location so it works in both ts-node/tsx dev and the
 * built Docker image.
 */
const FONTS_DIR = resolve(join(__dirname, '..', 'fonts'));

// ── XML escaping ─────────────────────────────────────────────────────
// All user text MUST go through this before embedding in SVG to prevent
// injection. Covers the XML-mandated five and also prevents script
// injection via entity tricks.

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ESCAPE_MAP[ch] ?? ch);
}

// ── Font resolution ──────────────────────────────────────────────────

/**
 * Resolves a font key (from the customization) or a CSS var string to
 * an absolute .ttf file path. Throws if the font file is missing —
 * callers must treat this as a hard failure (log + fail job), never
 * silently fall back to a wrong font.
 */
export function resolveFontPath(fontKeyOrCssVar: string): { fontFamily: string; fontPath: string } {
  // The customization stores fontFamily as `var(--font-xxx)` — try that first.
  const key = fontKeyFromCssVar(fontKeyOrCssVar) ?? fontKeyOrCssVar;
  const entry = fontEntryForKey(key);
  if (!entry) {
    throw new Error(`Unknown font key "${key}" (from "${fontKeyOrCssVar}"). Available: ${FONT_MAP.map((f) => f.key).join(', ')}`);
  }
  const fontPath = join(FONTS_DIR, entry.ttfFilename);
  if (!existsSync(fontPath)) {
    throw new Error(`Font file missing: ${fontPath} (key: "${key}"). Bundle the TTF in services/print-render/fonts/.`);
  }
  return { fontFamily: entry.label, fontPath };
}

/**
 * Returns absolute paths for all fallback fonts that are actually bundled.
 * Does NOT throw for missing fallbacks — they're optional.
 */
export function resolvedFallbackFonts(): Array<{ label: string; fontPath: string }> {
  return FALLBACK_FONTS
    .map((f) => ({ label: f.label, fontPath: join(FONTS_DIR, f.ttfFilename) }))
    .filter((f) => existsSync(f.fontPath));
}

// ── Text zone input ──────────────────────────────────────────────────

export interface PrintTextField {
  /** Text zone from FrameTemplate.textZones — position as 0-1 fractions. */
  zoneRect: Rect;
  align: 'left' | 'center' | 'right';
  /** The customer's actual text. */
  value: string;
  /** Font key (e.g. 'dancing-script') OR CSS var (e.g. 'var(--font-dancing-script)'). */
  fontKeyOrCssVar: string;
  /** Hex colour (e.g. '#D4AF37'). */
  color: string;
  /** Min/max font size in EDITOR canvas px (400×400). Will be scaled to print resolution. */
  minFontSizePx?: number;
  maxFontSizePx?: number;
}

// ── Server-side text measurement heuristic ───────────────────────────
// Without a real text shaping engine, we use a character-count heuristic
// that deliberately OVERESTIMATES width (0.65 × fontSize per character).
// This is conservative: text that fits on the server also fits on the
// client. The alternative (accurate shaping via HarfBuzz or canvas) would
// require a heavyweight native dependency we don't need for this project's
// decorative-text use case.

function serverMeasureTextWidth(text: string, fontSizePx: number): number {
  // Average character width as a fraction of font size.
  // 0.65 is intentionally wider than most Latin fonts (~0.5-0.55) to be
  // conservative. Cursive fonts (Dancing Script, Great Vibes) tend to be
  // wider due to ligatures and swashes.
  return text.length * fontSizePx * 0.65;
}

// ── SVG generation ───────────────────────────────────────────────────

/**
 * Builds one SVG buffer for a single text zone, at print resolution.
 * The SVG is sized to the full print canvas so Sharp can composite it
 * directly with `left: 0, top: 0`.
 */
export function buildTextZoneSvg(
  field: PrintTextField,
  printWidthPx: number,
  printHeightPx: number,
  editorCanvasSize: number = 400
): Buffer {
  if (!field.value.trim()) {
    // No text → transparent buffer (Sharp handles this gracefully)
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${printWidthPx}" height="${printHeightPx}"></svg>`
    );
  }

  const { fontFamily, fontPath } = resolveFontPath(field.fontKeyOrCssVar);
  const fallbacks = resolvedFallbackFonts();

  // Convert zone fractions → print-resolution px
  const zoneRect = fractionRectToCanvasRect(field.zoneRect, printWidthPx, printHeightPx);

  // Scale font sizes from editor canvas (400px) to print resolution
  const scaleFactor = printWidthPx / editorCanvasSize;
  const minFont = Math.max(1, (field.minFontSizePx ?? 8) * scaleFactor);
  const maxFont = Math.max(minFont, (field.maxFontSizePx ?? 32) * scaleFactor);

  // Fit text using the shared algorithm
  const fitResult: TextFitResult = fitTextToZone({
    text: field.value,
    zoneWidthPx: zoneRect.width,
    zoneHeightPx: zoneRect.height,
    minFontSizePx: minFont,
    maxFontSizePx: maxFont,
    measureTextWidth: serverMeasureTextWidth,
  });

  if (fitResult.lines.length === 0) {
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${printWidthPx}" height="${printHeightPx}"></svg>`
    );
  }

  // Compute text anchor and x position based on alignment
  let textAnchor: string;
  let textX: number;
  switch (field.align) {
    case 'left':
      textAnchor = 'start';
      textX = zoneRect.x;
      break;
    case 'right':
      textAnchor = 'end';
      textX = zoneRect.x + zoneRect.width;
      break;
    case 'center':
    default:
      textAnchor = 'middle';
      textX = zoneRect.x + zoneRect.width / 2;
      break;
  }

  const lineHeight = fitResult.fontSizePx * 1.2;
  const totalTextHeight = fitResult.lines.length * lineHeight;
  // Vertically center the text block within the zone
  const startY = zoneRect.y + (zoneRect.height - totalTextHeight) / 2 + fitResult.fontSizePx;

  // Build @font-face declarations
  const fontFaces = [
    `@font-face { font-family: '${escapeXml(fontFamily)}'; src: url('file://${fontPath.replace(/\\/g, '/')}'); }`,
    ...fallbacks.map(
      (f) => `@font-face { font-family: '${escapeXml(f.label)}'; src: url('file://${f.fontPath.replace(/\\/g, '/')}'); }`
    ),
  ].join('\n        ');

  // Font stack: primary → fallbacks → generic
  const fontStack = [fontFamily, ...fallbacks.map((f) => f.label), 'sans-serif']
    .map((n) => `'${escapeXml(n)}'`)
    .join(', ');

  const textElements = fitResult.lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `      <tspan x="${textX}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${printWidthPx}" height="${printHeightPx}">
    <style>
        ${fontFaces}
    </style>
    <text
      font-family="${fontStack}"
      font-size="${fitResult.fontSizePx}px"
      fill="${escapeXml(field.color)}"
      text-anchor="${textAnchor}"
      dominant-baseline="auto"
    >
${textElements}
    </text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * Verifies that all primary font files are present. Returns a list of
 * missing fonts. Used by the server health check at startup.
 */
export function verifyFontFiles(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const entry of FONT_MAP) {
    const fontPath = join(FONTS_DIR, entry.ttfFilename);
    if (!existsSync(fontPath)) {
      missing.push(`${entry.key} → ${fontPath}`);
    }
  }
  return { ok: missing.length === 0, missing };
}
