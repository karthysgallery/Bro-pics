/**
 * Pure text-fitting math shared by the client-side canvas preview
 * (EditorCanvas.tsx → drawTextField) and the server-side print renderer
 * (render-text.ts). Having one shared function means client and server
 * can never drift apart on how text is sized and wrapped.
 *
 * The function does NOT depend on DOM, Canvas 2D, or any rendering engine.
 * It takes a `measureText` callback so each consumer can plug in its own
 * measurement backend:
 *   - Client:  ctx.measureText(text).width   (Canvas 2D)
 *   - Server:  character-count heuristic     (no DOM available)
 *
 * The server heuristic is deliberately conservative (overestimates width)
 * so text that fits on the server also fits on the client — a tiny amount
 * of extra whitespace on the client is acceptable, but overflow is not.
 */

export interface TextFitInput {
  /** The user's text content. */
  text: string;
  /** Available zone width in the target coordinate system (canvas px or print px). */
  zoneWidthPx: number;
  /** Available zone height in the target coordinate system. */
  zoneHeightPx: number;
  /** Minimum font size in px — auto-shrink stops here. Default 8. */
  minFontSizePx?: number;
  /** Maximum / starting font size in px. Default 32. */
  maxFontSizePx?: number;
  /**
   * Measures the width of `text` rendered at `fontSizePx` in the target
   * font. The function is called repeatedly during the auto-shrink loop,
   * so it should be fast.
   */
  measureTextWidth: (text: string, fontSizePx: number) => number;
}

export interface TextFitResult {
  /** The computed font size (in the same px unit as the input). */
  fontSizePx: number;
  /** Text split into lines after word-wrapping at the floor size. A single
   *  line means no wrapping was needed. */
  lines: string[];
  /** Whether the font size had to shrink below the max to fit. */
  wasShrunk: boolean;
}

/**
 * Auto-fit a text string into a bounding box.
 *
 * Algorithm (matches EditorCanvas.tsx's drawTextField exactly):
 * 1. Start at maxFontSizePx (capped to zoneHeightPx).
 * 2. Step down by 1px until single-line text fits within zoneWidthPx AND
 *    fontSize ≤ zoneHeightPx.
 * 3. Stop at minFontSizePx — if text still overflows at the floor, apply
 *    word-wrap at that size and return multiple lines.
 */
export function fitTextToZone(input: TextFitInput): TextFitResult {
  const { text, zoneWidthPx, zoneHeightPx, measureTextWidth } = input;
  const rawMin = input.minFontSizePx ?? 8;
  const rawMax = input.maxFontSizePx ?? 32;

  if (!text.trim()) {
    return { fontSizePx: rawMax, lines: [], wasShrunk: false };
  }

  const floor = Math.max(1, rawMin);
  const ceiling = Math.max(floor, Math.min(rawMax, zoneHeightPx));

  // Phase 1: try fitting as a single line, shrinking from ceiling to floor.
  let fontSize = ceiling;
  for (; fontSize > floor; fontSize -= 1) {
    const width = measureTextWidth(text, fontSize);
    if (width <= zoneWidthPx && fontSize <= zoneHeightPx) {
      return { fontSizePx: fontSize, lines: [text], wasShrunk: fontSize < ceiling };
    }
  }

  // At floor size — check single-line fit one more time.
  fontSize = floor;
  const floorWidth = measureTextWidth(text, floor);
  if (floorWidth <= zoneWidthPx && floor <= zoneHeightPx) {
    return { fontSizePx: floor, lines: [text], wasShrunk: floor < ceiling };
  }

  // Phase 2: word-wrap at floor size.
  const lines = wordWrap(text, zoneWidthPx, (t) => measureTextWidth(t, floor));

  return { fontSizePx: floor, lines, wasShrunk: true };
}

/**
 * Simple greedy word-wrap: splits on whitespace boundaries, never breaking
 * inside a word (unless a single word is wider than the zone, in which case
 * it gets its own line and is allowed to overflow — truncation is the
 * caller's job if desired).
 */
export function wordWrap(
  text: string,
  maxWidthPx: number,
  measureWidth: (text: string) => number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const candidate = currentLine + ' ' + words[i]!;
    if (measureWidth(candidate) <= maxWidthPx) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i]!;
    }
  }
  lines.push(currentLine);

  return lines;
}
