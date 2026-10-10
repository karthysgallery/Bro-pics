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

const cache = new Map<string, Promise<number | null>>();

/** detectMouldingWidth for a loaded image, in the image's own pixels (cached per picture). */
export function mouldingWidthOf(img: HTMLImageElement, key = img.src): Promise<number | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const work = (async () => {
    const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = detectMouldingWidth({ data: data.data, width: data.width, height: data.height });
      return d === null ? null : Math.round(d / scale);
    } catch {
      return null; // an image the canvas may not read
    }
  })();
  cache.set(key, work);
  return work;
}
