/**
 * Finds how wide the moulding really is in a frame photo: where the wood ends
 * and the opening begins (a white mount, a plain backing, the wall behind an
 * empty frame, or transparency). Used so a frame is never drawn with a strip
 * of its own white inner edge around the customer's picture, even when the
 * moulding width was marked a little too wide.
 *
 * Pure (works on raw RGBA pixels) so it can be tested without a browser.
 */

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

interface LineStats {
  alpha: number;
  light: number;
  spread: number;
}

function lineStats(px: Pixels, coords: Array<[number, number]>): LineStats {
  let a = 0;
  let l = 0;
  let l2 = 0;
  for (const [x, y] of coords) {
    const i = (y * px.width + x) * 4;
    const lum = 0.299 * px.data[i]! + 0.587 * px.data[i + 1]! + 0.114 * px.data[i + 2]!;
    a += px.data[i + 3]!;
    l += lum;
    l2 += lum * lum;
  }
  const n = coords.length || 1;
  const mean = l / n;
  return { alpha: a / n, light: mean, spread: Math.sqrt(Math.max(0, l2 / n - mean * mean)) };
}

/**
 * Lines of one side, from the outer edge inwards, sampled across the middle
 * 40% of that side (corners and their mitres are left out).
 */
function sideLine(px: Pixels, side: 'top' | 'bottom' | 'left' | 'right', depth: number): Array<[number, number]> {
  const { width: w, height: h } = px;
  const out: Array<[number, number]> = [];
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? depth : h - 1 - depth;
    for (let x = Math.floor(w * 0.3); x < Math.ceil(w * 0.7); x += 2) out.push([x, y]);
  } else {
    const x = side === 'left' ? depth : w - 1 - depth;
    for (let y = Math.floor(h * 0.3); y < Math.ceil(h * 0.7); y += 2) out.push([x, y]);
  }
  return out;
}

/** Depth (in pixels) where one side's moulding ends, or null when it cannot tell. */
function sideDepth(px: Pixels, side: 'top' | 'bottom' | 'left' | 'right'): number | null {
  const short = Math.min(px.width, px.height);
  const maxDepth = Math.floor(short * 0.45);
  const minFrame = Math.max(2, Math.round(short * 0.02));
  const run = Math.max(2, Math.round(short * 0.012));
  // What the moulding looks like: its first few lines (inside the very outer edge).
  const ref: LineStats[] = [];
  for (let d = 1; d <= minFrame; d++) ref.push(lineStats(px, sideLine(px, side, d)));
  const frameLight = ref.reduce((n, s) => n + s.light, 0) / ref.length;
  const frameAlpha = ref.reduce((n, s) => n + s.alpha, 0) / ref.length;
  if (frameAlpha < 128) return null; // the photo starts with empty space: nothing to measure from
  const isOpening = (s: LineStats) => s.alpha < 60 || (s.spread < 16 && Math.abs(s.light - frameLight) > 32);
  let streak = 0;
  for (let d = minFrame; d < maxDepth; d++) {
    if (isOpening(lineStats(px, sideLine(px, side, d)))) {
      streak++;
      if (streak >= run) return d - run + 1;
    } else streak = 0;
  }
  return null;
}

/**
 * The moulding width in this photo's pixels: the narrowest side found (so no
 * side shows any of the opening), or null when fewer than two sides could be
 * measured — e.g. a white frame with a white mount, where only the owner's own
 * marking can be trusted.
 */
export function detectMouldingWidth(px: Pixels): number | null {
  const found = (['top', 'bottom', 'left', 'right'] as const).map((s) => sideDepth(px, s)).filter((d): d is number => d !== null);
  if (found.length < 2) return null;
  return Math.min(...found);
}

export interface Margins {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Light or empty strips along the OUTER edge of a frame photo (a white or cream background left on one or
 * more sides, a soft shadow, transparency) that are not part of the frame. Drawn as if they were frame they
 * show as a gap beside the picture, so they are measured and cut off first.
 *
 * A strip counts only when a clearly darker line (the moulding) follows it within a few percent of the photo:
 * a white-painted frame has no such step and is left untouched.
 */
export function detectOuterMargins(px: Pixels): Margins {
  const short = Math.min(px.width, px.height);
  const maxTrim = Math.max(2, Math.floor(short * 0.08));
  const isMargin = (s: LineStats) => s.alpha < 60 || (s.light > 195 && s.spread < 20);
  const one = (side: 'top' | 'bottom' | 'left' | 'right'): number => {
    let n = 0;
    while (n <= maxTrim && isMargin(lineStats(px, sideLine(px, side, n)))) n++;
    if (n === 0 || n > maxTrim) return 0;
    const next = lineStats(px, sideLine(px, side, n));
    if (next.alpha < 128 || next.light > 170) return 0; // no moulding behind it: not a margin
    return n;
  };
  return { top: one('top'), bottom: one('bottom'), left: one('left'), right: one('right') };
}

/** The pixels inside `m` (a copy). */
export function cropPixels(px: Pixels, m: Margins): Pixels {
  const width = px.width - m.left - m.right;
  const height = px.height - m.top - m.bottom;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((y + m.top) * px.width + m.left) * 4;
    data.set(px.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
}

/** Where the frame really is inside its photo (source rectangle, in the photo's own pixels) and its moulding width. */
export interface FrameGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Moulding width measured inside that rectangle, or null when it cannot tell. */
  mould: number | null;
}

export function measureFrame(px: Pixels): { margins: Margins; mould: number | null } {
  const margins = detectOuterMargins(px);
  const inner = margins.top || margins.bottom || margins.left || margins.right ? cropPixels(px, margins) : px;
  return { margins, mould: detectMouldingWidth(inner) };
}

const cache = new Map<string, Promise<FrameGeometry>>();

/** The frame's real rectangle and moulding width for a loaded image, in the image's own pixels (cached per picture). */
export function frameGeometryOf(img: HTMLImageElement, key = img.src): Promise<FrameGeometry> {
  const hit = cache.get(key);
  if (hit) return hit;
  const whole: FrameGeometry = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, mould: null };
  const work = (async () => {
    const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return whole;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { margins, mould } = measureFrame({ data: data.data, width: data.width, height: data.height });
      const x = Math.round(margins.left / scale);
      const y = Math.round(margins.top / scale);
      return {
        x,
        y,
        w: Math.max(1, img.naturalWidth - x - Math.round(margins.right / scale)),
        h: Math.max(1, img.naturalHeight - y - Math.round(margins.bottom / scale)),
        mould: mould === null ? null : Math.round(mould / scale),
      };
    } catch {
      return whole; // an image the canvas may not read
    }
  })();
  cache.set(key, work);
  return work;
}

/** The moulding width in the image's own pixels, or null. */
export async function mouldingWidthOf(img: HTMLImageElement, key = img.src): Promise<number | null> {
  return (await frameGeometryOf(img, key)).mould;
}
