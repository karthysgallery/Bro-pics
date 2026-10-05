import { PersonalizationTemplateSchema, type PersonalizationTemplate, type TemplateType } from './template-schema';

/**
 * Finds the photo areas in a collage design the admin uploads, so a
 * multi-photo template can be proposed automatically. Classical image
 * analysis only (no model, no network), run on a downscaled copy:
 *
 * 1. Transparent windows: a PNG frame whose photo openings are transparent.
 *    Every enclosed transparent area is a slot, and the artwork is laid ABOVE
 *    the photos (it is the frame). The most reliable input.
 * 2. Opaque designs on a plain background:
 *    - placeholder boxes or sample photos that differ from the background,
 *    - outlined boxes whose inside is background-coloured.
 *    The artwork is laid BELOW the photos, which cover the placeholders.
 *
 * Every area is classified as rectangle (possibly tilted), rounded rectangle,
 * ellipse or polygon, and anything that is not a plausible photo area
 * (text, lines, ornaments) is dropped. The result is a proposal: the admin
 * reviews and adjusts it in the template builder before anything is published.
 */

export interface RgbaPixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
}

export type DetectionSource = 'transparent-window' | 'placeholder' | 'enclosed-area';

export interface DetectedSlot {
  /** Unrotated box, as fractions of the image. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise tilt about the box centre. */
  rotationDeg: number;
  shape: 'rect' | 'rounded' | 'ellipse' | 'polygon';
  cornerRadius?: number;
  /** For polygons: points as fractions of the slot's own box. */
  polygon?: Array<{ x: number; y: number }>;
  /** 0..1: how sure the detector is that this is a photo area. */
  confidence: number;
  source: DetectionSource;
}

export interface SlotDetectionResult {
  mode: 'transparent-windows' | 'opaque' | 'none';
  slots: DetectedSlot[];
  /** Where the uploaded artwork belongs in the paint stack relative to the photos. */
  artworkPlacement: 'above-photos' | 'below-photos';
  /** The plain background colour found around an opaque design, as #rrggbb. */
  backgroundColor?: string;
  /** Plain-language notes for the admin (what was found, what to check). */
  notes: string[];
}

export interface DetectOptions {
  /** Smallest photo area, as a share of the image (default 0.3%). */
  minAreaFraction?: number;
  /** Largest photo area, as a share of the image (default 92%). */
  maxAreaFraction?: number;
  /** Colour distance (max channel difference) still counted as background (default 28). */
  colorTolerance?: number;
  /** Alpha below this is transparent (default 24). */
  alphaThreshold?: number;
  /** Cap on the number of slots returned, most confident first (default 80). */
  maxSlots?: number;
}

interface Component {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBorder: boolean;
}

/** Connected components (4-connectivity) of a binary mask. Labels are 1-based; 0 = not in mask. */
function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; components: Component[] } {
  const labels = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const components: Component[] = [];
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const comp: Component = { id: next, area: 0, minX: w, minY: h, maxX: -1, maxY: -1, touchesBorder: false };
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = next;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      comp.area++;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) comp.touchesBorder = true;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = next; queue[tail++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = next; queue[tail++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = next; queue[tail++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = next; queue[tail++] = p + w; }
    }
    components.push(comp);
    next++;
  }
  return { labels, components };
}

interface Pt {
  x: number;
  y: number;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function polygonArea(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(sum) / 2;
}

/** Smallest-area enclosing rectangle of a convex polygon (rotating calipers over its edges). */
function minAreaRect(hull: Pt[]): { cx: number; cy: number; width: number; height: number; angleDeg: number } {
  let best = { area: Infinity, cx: 0, cy: 0, width: 0, height: 0, angleDeg: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of hull) {
      const x = p.x * cos - p.y * sin;
      const y = p.x * sin + p.y * cos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < best.area - 1e-9) {
      // Centre back in image space.
      const mx = (minX + maxX) / 2;
      const my = (minY + maxY) / 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      best = { area, cx: mx * c - my * s, cy: mx * s + my * c, width: maxX - minX, height: maxY - minY, angleDeg: (angle * 180) / Math.PI };
    }
  }
  // Normalise the angle to (-45, 45] by swapping sides.
  let { width, height, angleDeg } = best;
  while (angleDeg > 45) {
    angleDeg -= 90;
    [width, height] = [height, width];
  }
  while (angleDeg <= -45) {
    angleDeg += 90;
    [width, height] = [height, width];
  }
  return { cx: best.cx, cy: best.cy, width, height, angleDeg };
}

/** Douglas–Peucker simplification of a closed polygon. */
function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 4) return points;
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= epsilon) return [a, b];
    const left = dp(pts.slice(0, idx + 1));
    const right = dp(pts.slice(idx));
    return left.slice(0, -1).concat(right);
  };
  // Split the ring at its two farthest points so both halves are open chains.
  let far = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y) > Math.hypot(points[far].x - points[0].x, points[far].y - points[0].y)) far = i;
  }
  const first = dp(points.slice(0, far + 1));
  const second = dp([...points.slice(far), points[0]]);
  return first.slice(0, -1).concat(second.slice(0, -1));
}

interface Analysis {
  slot: DetectedSlot;
  /** Axis-aligned box in pixels, for nesting checks. */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** Mostly hollow (an outline): its inside, not the outline, is the photo area. */
  ringLike: boolean;
}

/**
 * Measures one component and decides what shape it is, or that it isn't a
 * photo area at all. `grow` extends the slot by that many pixels on every side
 * (used for transparent windows so the photo tucks under the frame's soft edge).
 */
function analyse(labels: Int32Array, w: number, h: number, comp: Component, source: DetectionSource, grow: number): Analysis | null {
  const bw = comp.maxX - comp.minX + 1;
  const bh = comp.maxY - comp.minY + 1;
  if (bw < 8 || bh < 8) return null;

  // Fill holes (text or icons inside a placeholder) within the component's box.
  const local = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const row = (comp.minY + y) * w + comp.minX;
    for (let x = 0; x < bw; x++) if (labels[row + x] === comp.id) local[y * bw + x] = 1;
  }
  const outside = new Uint8Array(bw * bh);
  const queue = new Int32Array(bw * bh);
  let head = 0;
  let tail = 0;
  const seed = (i: number) => {
    if (!local[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < bw; x++) {
    seed(x);
    seed((bh - 1) * bw + x);
  }
  for (let y = 0; y < bh; y++) {
    seed(y * bw);
    seed(y * bw + bw - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % bw;
    if (x > 0) seed(p - 1);
    if (x < bw - 1) seed(p + 1);
    if (p >= bw) seed(p - bw);
    if (p < bw * (bh - 1)) seed(p + bw);
  }
  let filled = 0;
  const rowMin = new Int32Array(bh).fill(-1);
  const rowMax = new Int32Array(bh).fill(-1);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!outside[y * bw + x]) {
        filled++;
        if (rowMin[y] < 0) rowMin[y] = x;
        rowMax[y] = x;
      }
    }
  }

  // Hull of the filled shape from each row's extremes (pixel corners, so areas are exact for rectangles).
  const points: Pt[] = [];
  for (let y = 0; y < bh; y++) {
    if (rowMin[y] < 0) continue;
    const gx = comp.minX + rowMin[y];
    const gr = comp.minX + rowMax[y] + 1;
    const gy = comp.minY + y;
    points.push({ x: gx, y: gy }, { x: gx, y: gy + 1 }, { x: gr, y: gy }, { x: gr, y: gy + 1 });
  }
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const hullArea = polygonArea(hull);
  const solidity = filled / hullArea;
  const mr = minAreaRect(hull);
  const rectArea = mr.width * mr.height;
  const rectangularity = filled / rectArea;
  const ellipseFit = filled / ((Math.PI / 4) * rectArea);
  const aspect = Math.max(mr.width, mr.height) / Math.max(1, Math.min(mr.width, mr.height));
  if (aspect > 8) return null;

  const hullRectRatio = hullArea / rectArea;
  const axisAligned = Math.abs(mr.angleDeg) < 1.5;
  // How filled the four corners of the box are: low for rounded corners and ellipses.
  let cornerFill = 1;
  if (axisAligned) {
    const c = Math.max(2, Math.round(0.08 * Math.min(bw, bh)));
    const corner = (x0: number, y0: number) => {
      let inside = 0;
      for (let y = y0; y < y0 + c; y++) for (let x = x0; x < x0 + c; x++) if (!outside[y * bw + x]) inside++;
      return inside / (c * c);
    };
    cornerFill = Math.min(corner(0, 0), corner(bw - c, 0), corner(0, bh - c), corner(bw - c, bh - c));
  }

  let shape: DetectedSlot['shape'];
  let confidence: number;
  let cornerRadius: number | undefined;
  if (rectangularity >= 0.93 && cornerFill >= 0.6) {
    shape = 'rect';
    confidence = 0.75 + (rectangularity - 0.93) * 3.3;
  } else if (Math.abs(ellipseFit - 1) <= 0.06 && solidity >= 0.97) {
    shape = 'ellipse';
    confidence = 0.8 - Math.abs(ellipseFit - 1) * 2;
  } else if (rectangularity >= 0.8 && solidity >= 0.97 && cornerFill < 0.6) {
    shape = 'rounded';
    const missing = rectArea - filled;
    const radiusPx = Math.sqrt(Math.max(0, missing) / (4 - Math.PI));
    cornerRadius = Math.min(0.5, radiusPx / Math.min(mr.width, mr.height));
    confidence = 0.72;
  } else if (source === 'placeholder' && hullRectRatio >= 0.95 && solidity >= 0.7) {
    // A sample photo whose light edges merge with a light gutter: its outline is
    // still a clean rectangle even though some edge pixels look like background.
    shape = 'rect';
    confidence = 0.55 + (solidity - 0.7) * 0.6;
  } else if (solidity >= 0.9 && rectangularity >= 0.5) {
    shape = 'polygon';
    confidence = 0.5;
  } else {
    return null; // text, line work, ornaments
  }
  if (source !== 'transparent-window' && comp.touchesBorder) confidence -= 0.15;
  confidence = Math.max(0.05, Math.min(0.99, confidence));

  const tilted = shape !== 'polygon' && Math.abs(mr.angleDeg) >= 1.5 && !(shape === 'ellipse' && Math.abs(aspect - 1) < 0.04);
  let cx: number;
  let cy: number;
  let sw: number;
  let sh: number;
  let rotationDeg = 0;
  if (tilted) {
    cx = mr.cx;
    cy = mr.cy;
    sw = mr.width + grow * 2;
    sh = mr.height + grow * 2;
    rotationDeg = Math.round(mr.angleDeg * 10) / 10;
  } else {
    cx = comp.minX + bw / 2;
    cy = comp.minY + bh / 2;
    sw = bw + grow * 2;
    sh = bh + grow * 2;
  }

  let polygon: DetectedSlot['polygon'];
  if (shape === 'polygon') {
    const simplified = simplify(hull, Math.max(1, 0.012 * Math.max(bw, bh)));
    const left = cx - sw / 2;
    const top = cy - sh / 2;
    polygon = simplified.map((p) => ({ x: clamp01((p.x - left) / sw), y: clamp01((p.y - top) / sh) }));
    if (polygon.length < 3) return null;
  }

  const slot: DetectedSlot = {
    x: clamp01((cx - sw / 2) / w),
    y: clamp01((cy - sh / 2) / h),
    width: Math.min(1, sw / w),
    height: Math.min(1, sh / h),
    rotationDeg,
    shape,
    ...(cornerRadius !== undefined && { cornerRadius: Math.round(cornerRadius * 1000) / 1000 }),
    ...(polygon && { polygon }),
    confidence: Math.round(confidence * 100) / 100,
    source,
  };
  // Keep the unrotated box inside the image.
  slot.width = Math.min(slot.width, 1 - slot.x);
  slot.height = Math.min(slot.height, 1 - slot.y);
  return { slot, box: { minX: comp.minX, minY: comp.minY, maxX: comp.maxX, maxY: comp.maxY }, ringLike: comp.area / filled < 0.6 };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Most common colour along the image border, with its share of the border. */
function dominantBorderColor(px: RgbaPixels): { r: number; g: number; b: number; share: number } | null {
  const { width: w, height: h, data } = px;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128) return;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
    total++;
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  if (total === 0) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return null;
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n), share: best.n / total };
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

/** Reading order: top-to-bottom in rows, left-to-right within a row. */
function readingOrder(slots: DetectedSlot[]): DetectedSlot[] {
  if (slots.length < 2) return slots;
  const heights = slots.map((s) => s.height).sort((a, b) => a - b);
  const band = heights[Math.floor(heights.length / 2)] * 0.5;
  const sorted = [...slots].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const rows: DetectedSlot[][] = [];
  for (const s of sorted) {
    const cy = s.y + s.height / 2;
    const row = rows.find((r) => Math.abs(r[0].y + r[0].height / 2 - cy) <= band);
    if (row) row.push(s);
    else rows.push([s]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

const contains = (outer: Analysis['box'], inner: Analysis['box']) =>
  outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;

export function detectPhotoSlots(px: RgbaPixels, options: DetectOptions = {}): SlotDetectionResult {
  const { width: w, height: h, data } = px;
  const n = w * h;
  const notes: string[] = [];
  if (w < 16 || h < 16 || data.length < n * 4) {
    return { mode: 'none', slots: [], artworkPlacement: 'below-photos', notes: ['The image is too small to analyse.'] };
  }
  const minArea = Math.max(64, Math.round((options.minAreaFraction ?? 0.003) * n));
  const maxArea = Math.round((options.maxAreaFraction ?? 0.92) * n);
  const tol = options.colorTolerance ?? 28;
  const alphaThreshold = options.alphaThreshold ?? 24;
  const maxSlots = options.maxSlots ?? 80;

  // 1. Transparent windows.
  const transparent = new Uint8Array(n);
  let transparentCount = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < alphaThreshold) {
      transparent[i] = 1;
      transparentCount++;
    }
  }
  if (transparentCount >= n * 0.005) {
    const { labels, components } = labelComponents(transparent, w, h);
    const windows = components.filter((c) => !c.touchesBorder && c.area >= minArea && c.area <= maxArea);
    const found = windows.map((c) => analyse(labels, w, h, c, 'transparent-window', 2)).filter((a): a is Analysis => a !== null);
    if (found.length > 0) {
      const slots = readingOrder(found.map((a) => a.slot).sort((a, b) => b.confidence - a.confidence).slice(0, maxSlots));
      notes.push(`Found ${slots.length} transparent photo window${slots.length === 1 ? '' : 's'}. The design will sit on top of the customer's photos.`);
      return { mode: 'transparent-windows', slots, artworkPlacement: 'above-photos', notes };
    }
    notes.push('The image has transparent areas, but none are enclosed photo windows.');
  }

  // 2. Opaque design on a plain background.
  const bg = dominantBorderColor(px);
  if (!bg || bg.share < 0.45) {
    notes.push('No plain background colour runs around the design, so the photo areas could not be separated from it. Draw the slots by hand, or upload the design with transparent photo windows.');
    return { mode: 'none', slots: [], artworkPlacement: 'below-photos', notes };
  }
  const isBg = new Uint8Array(n);
  const notBg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const close = Math.max(Math.abs(data[o] - bg.r), Math.abs(data[o + 1] - bg.g), Math.abs(data[o + 2] - bg.b)) <= tol;
    if (close || data[o + 3] < alphaThreshold) isBg[i] = 1;
    else notBg[i] = 1;
  }

  const candidates: Analysis[] = [];
  // a) Inside of outlined boxes: background-coloured areas enclosed by line work.
  {
    const { labels, components } = labelComponents(isBg, w, h);
    for (const c of components) {
      if (c.touchesBorder || c.area < minArea || c.area > maxArea) continue;
      const a = analyse(labels, w, h, c, 'enclosed-area', 0);
      if (a) candidates.push(a);
    }
  }
  // b) Placeholder boxes / sample photos that differ from the background.
  {
    const { labels, components } = labelComponents(notBg, w, h);
    for (const c of components) {
      if (c.area < minArea || c.area > maxArea) continue;
      const a = analyse(labels, w, h, c, 'placeholder', 0);
      if (a) candidates.push(a);
    }
  }

  // A shape that merely contains several others (an outer border, a panel behind
  // the photos) is a container, not a photo area.
  let kept = candidates.filter((a) => candidates.filter((b) => b !== a && contains(a.box, b.box)).length < 2);
  // Where one candidate sits inside exactly one other: an outline (ring) gives way
  // to the area it encloses, so the printed border stays visible around the photo;
  // otherwise the more confident of the two wins.
  const drop = new Set<Analysis>();
  for (const a of kept) {
    const outer = kept.find((b) => b !== a && contains(b.box, a.box));
    if (!outer) continue;
    if (outer.ringLike) drop.add(outer);
    else if (a.slot.confidence > outer.slot.confidence) drop.add(outer);
    else drop.add(a);
  }
  kept = kept.filter((a) => !drop.has(a));

  const slots = readingOrder(kept.map((a) => a.slot).sort((a, b) => b.confidence - a.confidence).slice(0, maxSlots));
  const backgroundColor = `#${hex(bg.r)}${hex(bg.g)}${hex(bg.b)}`;
  if (slots.length === 0) {
    notes.push('No photo areas were found. Draw the slots by hand, or upload the design with transparent photo windows.');
    return { mode: 'none', slots, artworkPlacement: 'below-photos', backgroundColor, notes };
  }
  notes.push(`Found ${slots.length} photo area${slots.length === 1 ? '' : 's'} on a ${backgroundColor} background. Customer photos will be placed over them.`);
  const lowConfidence = slots.filter((s) => s.confidence < 0.6).length;
  if (lowConfidence > 0) notes.push(`${lowConfidence} area${lowConfidence === 1 ? ' is' : 's are'} uncertain — check them before publishing.`);
  return { mode: 'opaque', slots, artworkPlacement: 'below-photos', backgroundColor, notes };
}

export interface DraftFromDetectionInput {
  id: string;
  name: string;
  type?: TemplateType;
  /** The uploaded design, already in the media library. */
  artwork: { assetId: string; url?: string };
  /** Print canvas in pixels (e.g. inches x dpi). */
  canvas: { width: number; height: number; dpi?: number };
  detection: SlotDetectionResult;
}

/** Turns a detection into a DRAFT template the admin can review in the builder. */
export function templateDraftFromDetection(input: DraftFromDetectionInput): PersonalizationTemplate {
  const photoSlots = input.detection.slots.map((s, i) => ({
    id: `photo_${String(i + 1).padStart(2, '0')}`,
    label: input.detection.slots.length === 1 ? 'Your photo' : `Photo ${i + 1}`,
    required: true,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    rotationDeg: s.rotationDeg,
    shape: s.shape,
    ...(s.cornerRadius !== undefined && { cornerRadius: s.cornerRadius }),
    ...(s.polygon && { polygon: s.polygon }),
    fit: 'cover' as const,
  }));
  const artworkLayer = {
    kind: 'fixed' as const,
    id: 'design',
    role: input.detection.artworkPlacement === 'above-photos' ? ('frame' as const) : ('background' as const),
    asset: { assetId: input.artwork.assetId, ...(input.artwork.url && { url: input.artwork.url }) },
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    printed: true,
  };
  const slotLayers = photoSlots.map((s) => ({ kind: 'photoSlot' as const, slotId: s.id }));
  const count = photoSlots.length;
  return PersonalizationTemplateSchema.parse({
    id: input.id,
    version: 1,
    status: 'draft',
    type: input.type ?? (count <= 1 ? 'single_photo' : count <= 3 ? 'multi_photo' : 'collage'),
    name: input.name,
    canvas: { width: input.canvas.width, height: input.canvas.height, dpi: input.canvas.dpi ?? 300 },
    ...(input.detection.backgroundColor && { background: { type: 'color', color: input.detection.backgroundColor } }),
    photoSlots,
    textSlots: [],
    layers: input.detection.artworkPlacement === 'above-photos' ? [...slotLayers, artworkLayer] : [artworkLayer, ...slotLayers],
  });
}
