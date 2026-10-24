/**
 * Cuts a finished frame image out of its background so it can stand on a real
 * photograph. The editor's composite is drawn on a paper-coloured square; on a
 * wall that square would show as a pale box. The background is found by
 * flooding inwards from the image edges, so only the area *outside* the frame
 * is removed: a window, mat or white photo inside the frame is enclosed by the
 * frame and stays opaque even when it is the same colour as the paper.
 */
export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface CutoutOptions {
  /** Largest per-channel difference from the background colour still counted as background. */
  tolerance?: number;
  /**
   * An opaque background must be at least this bright (0-255). A dark frame that
   * runs to the image edge would otherwise be mistaken for its own background.
   */
  minBackgroundLuma?: number;
  /** Cut-outs that remove less than this share of the image are rejected (nothing to cut). */
  minRemoved?: number;
  /** Cut-outs that remove more than this share are rejected (the frame would be gone). */
  maxRemoved?: number;
  /** Largest per-channel step between neighbouring backdrop pixels the flood follows (a shaded backdrop). 0 = flat colour only. */
  gradientStep?: number;
  /** How far a shaded backdrop (or the frame's soft shadow) may drift from the corner colour and still be removed. */
  maxDrift?: number;
}

export interface CutoutResult {
  /** The frame, cropped to its outer edge, transparent outside it. */
  pixels: Pixels;
  /** Where that crop sits in the source image. */
  box: { x: number; y: number; width: number; height: number };
  removedFraction: number;
}

const ALPHA_OPAQUE_MIN = 8;

function channelDistance(d: Uint8ClampedArray, i: number, r: number, g: number, b: number): number {
  return Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b));
}

/** Background = transparent pixels, or the uniform colour found in all four corners. */
function detectBackground(p: Pixels, tolerance: number, minLuma: number): { transparent: boolean; r: number; g: number; b: number } | null {
  const { width: w, height: h, data: d } = p;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  if (corners.every((i) => d[i + 3] < ALPHA_OPAQUE_MIN)) return { transparent: true, r: 0, g: 0, b: 0 };
  if (corners.some((i) => d[i + 3] < 250)) return null;
  const [a] = corners;
  const r = d[a];
  const g = d[a + 1];
  const b = d[a + 2];
  if (corners.some((i) => channelDistance(d, i, r, g, b) > tolerance)) return null;
  if (0.2126 * r + 0.7152 * g + 0.0722 * b < minLuma) return null;
  return { transparent: false, r, g, b };
}

export function cutOutBackground(source: Pixels, options: CutoutOptions = {}): CutoutResult | null {
  const { tolerance = 12, minRemoved = 0.004, maxRemoved = 0.92, minBackgroundLuma = 180 } = options;
  const { width: w, height: h } = source;
  if (w < 3 || h < 3 || source.data.length < w * h * 4) return null;

  const bg = detectBackground(source, tolerance, minBackgroundLuma);
  if (!bg) return null;

  // A product photo's backdrop is rarely one flat colour: it is shaded (lighter behind the frame) and the frame casts
  // a soft shadow. So the flood may also step to a neighbour that is only slightly different from the pixel it came
  // from (a smooth gradient), as long as it stays near the backdrop colour. A frame's edge is a sharp step, so the
  // flood still stops there. If that would remove too much (a pale frame on a pale backdrop), the strict flat-colour
  // flood is used instead.
  const attempts = bg.transparent ? [0] : [options.gradientStep ?? 6, 0];
  for (const step of attempts) {
    const result = floodCutout(source, bg, { tolerance, step, maxDrift: options.maxDrift ?? 72, minRemoved, maxRemoved });
    if (result) return result;
  }
  return null;
}

function floodCutout(
  source: Pixels,
  bg: { transparent: boolean; r: number; g: number; b: number },
  o: { tolerance: number; step: number; maxDrift: number; minRemoved: number; maxRemoved: number }
): CutoutResult | null {
  const { width: w, height: h, data: d } = source;
  const opaqueBackground = (px: number, from: number): boolean => {
    const i = px * 4;
    if (d[i + 3] <= 250) return false;
    const fromBg = channelDistance(d, i, bg.r, bg.g, bg.b);
    if (fromBg <= o.tolerance) return true;
    return o.step > 0 && from >= 0 && fromBg <= o.maxDrift && channelDistance(d, i, d[from * 4], d[from * 4 + 1], d[from * 4 + 2]) <= o.step;
  };
  const isBackground = (px: number, from: number): boolean => (bg.transparent ? d[px * 4 + 3] < ALPHA_OPAQUE_MIN : opaqueBackground(px, from));

  // Flood fill from every background pixel on the border.
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (px: number, from: number) => {
    if (outside[px] || !isBackground(px, from)) return;
    outside[px] = 1;
    queue[tail++] = px;
  };
  for (let x = 0; x < w; x++) {
    push(x, -1);
    push((h - 1) * w + x, -1);
  }
  for (let y = 1; y < h - 1; y++) {
    push(y * w, -1);
    push(y * w + (w - 1), -1);
  }
  while (head < tail) {
    const px = queue[head++];
    const x = px % w;
    if (x > 0) push(px - 1, px);
    if (x < w - 1) push(px + 1, px);
    if (px >= w) push(px - w, px);
    if (px < w * (h - 1)) push(px + w, px);
  }

  // Keep only the frame: the largest connected piece of what is left. Anything else standing on the backdrop
  // (a caption badge, a logo, specks of shadow) would otherwise be pasted onto the room with it.
  const label = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (outside[start] || label[start]) continue;
    next++;
    let size = 0;
    head = 0;
    tail = 0;
    label[start] = next;
    queue[tail++] = start;
    while (head < tail) {
      const px = queue[head++];
      size++;
      const x = px % w;
      const around = [x > 0 ? px - 1 : -1, x < w - 1 ? px + 1 : -1, px >= w ? px - w : -1, px < w * (h - 1) ? px + w : -1];
      for (const n of around) {
        if (n < 0 || outside[n] || label[n]) continue;
        label[n] = next;
        queue[tail++] = n;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  if (best === 0) return null;
  for (let px = 0; px < w * h; px++) if (!outside[px] && label[px] !== best) outside[px] = 1;

  const removedFraction = 1 - bestSize / (w * h);
  if (removedFraction < o.minRemoved || removedFraction > o.maxRemoved) return null;

  // Bounding box of what is kept (plus the 1px anti-aliased edge around it).
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!outside[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const sx = x + box.x;
      const sy = y + box.y;
      const px = sy * w + sx;
      const si = px * 4;
      const oi = (y * box.width + x) * 4;
      if (outside[px]) continue; // stays fully transparent

      out[oi] = d[si];
      out[oi + 1] = d[si + 1];
      out[oi + 2] = d[si + 2];
      let alpha = d[si + 3];

      // Anti-alias the cut edge: kept pixels touching the removed background
      // are partly background, so the nearer they are to it, the more
      // transparent they become. This avoids a pale fringe on dark walls.
      if (!bg.transparent) {
        const neighbour = sx > 0 && outside[px - 1] ? px - 1 : sx < w - 1 && outside[px + 1] ? px + 1 : sy > 0 && outside[px - w] ? px - w : sy < h - 1 && outside[px + w] ? px + w : -1;
        if (neighbour >= 0) {
          // Compared with the backdrop right beside it, which may be shaded differently from the corners.
          const ni = neighbour * 4;
          const dist = channelDistance(d, si, d[ni], d[ni + 1], d[ni + 2]);
          const coverage = Math.min(1, Math.max(0, (dist - o.tolerance) / 160));
          alpha = Math.round(alpha * coverage);
        }
      }
      out[oi + 3] = alpha;
    }
  }

  return { pixels: { width: box.width, height: box.height, data: out }, box, removedFraction };
}

export interface FrameCutout {
  /** PNG data URL of the frame with a transparent surround. */
  url: string;
  /** Outer width / height of the frame itself. */
  aspect: number;
}

/**
 * Browser helper: loads an image URL, cuts the frame out and returns it as a
 * transparent PNG. Resolves null when no cut-out is possible (cross-origin
 * pixels the canvas may not read, a frame the same colour as its background,
 * nothing to remove); callers then show the image as it is.
 */
export async function cutOutFrameFromUrl(url: string, options?: CutoutOptions): Promise<FrameCutout | null> {
  if (typeof document === 'undefined') return null;
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = cutOutBackground({ width: imageData.width, height: imageData.height, data: imageData.data }, options);
    if (!result) return null;
    const out = document.createElement('canvas');
    out.width = result.pixels.width;
    out.height = result.pixels.height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    const pixels = new Uint8ClampedArray(result.pixels.data.length);
    pixels.set(result.pixels.data);
    outCtx.putImageData(new ImageData(pixels, result.pixels.width, result.pixels.height), 0, 0);
    return { url: out.toDataURL('image/png'), aspect: result.pixels.width / result.pixels.height };
  } catch {
    // Tainted canvas or similar: show the original rather than failing.
    return null;
  }
}
