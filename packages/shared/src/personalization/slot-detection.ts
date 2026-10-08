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

export type DetectionSource = 'transparent-window' | 'placeholder' | 'enclosed-area' | 'grid-cell';

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

/** A line (or block of lines) of printed wording on the design, proposed as a text box. */
export interface DetectedText {
  /** The proposed text box, as fractions of the image: the wording plus the free space beside it. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tight box round the printed wording (fractions), to be cleared from the artwork. */
  erase: { x: number; y: number; width: number; height: number };
  /** Ink colour of the wording, #rrggbb. */
  color: string;
  /** Estimated font size as a fraction of the image width. */
  fontSize: number;
  lines: number;
  align: 'left' | 'center' | 'right';
  confidence: number;
}

export interface SlotDetectionResult {
  mode: 'transparent-windows' | 'opaque' | 'none';
  slots: DetectedSlot[];
  /** Printed wording found on the design (opaque designs only). */
  texts?: DetectedText[];
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

/**
 * The design's background colour: the per-channel median of a thin band round
 * the edge, with the share of that band within `tol` of it. A median rather
 * than the single most common colour, so a softly shaded or slightly noisy
 * (photographed, JPEG) background still reads as one colour.
 */
function dominantBorderColor(px: RgbaPixels, tol: number): { r: number; g: number; b: number; share: number; noise: number } | null {
  const { width: w, height: h, data } = px;
  const band = Math.max(2, Math.round(0.015 * Math.min(w, h)));
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const samples: number[] = [];
  for (let y = 0; y < h; y++) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= band && x < w - band) {
        x = w - band - 1;
        continue;
      }
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      hist[0][data[i]]++;
      hist[1][data[i + 1]]++;
      hist[2][data[i + 2]]++;
      samples.push(i);
    }
  }
  if (samples.length === 0) return null;
  const median = (hgram: Uint32Array) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hgram[v];
      if (seen * 2 >= samples.length) return v;
    }
    return 255;
  };
  const r = median(hist[0]);
  const g = median(hist[1]);
  const b = median(hist[2]);
  let close = 0;
  const spread = new Uint32Array(tol + 1);
  for (const i of samples) {
    const d = Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b));
    if (d <= tol) {
      close++;
      spread[d]++;
    }
  }
  // How much the background itself varies (shading, noise): the 90th percentile distance.
  let noise = 0;
  for (let seen = 0; noise <= tol; noise++) {
    seen += spread[noise];
    if (seen >= 0.9 * close) break;
  }
  return { r, g, b, share: close / samples.length, noise };
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
  const bg = dominantBorderColor(px, tol);
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
      // Grown by a pixel so no sliver of the design's own colour shows between
      // the line work and the customer's photo after scaling up to print size.
      const a = analyse(labels, w, h, c, 'enclosed-area', 1);
      if (a) candidates.push(a);
    }
  }
  // b) Placeholder boxes / sample photos that differ from the background.
  const fg = labelComponents(notBg, w, h);
  const rejected: Component[] = [];
  for (const c of fg.components) {
    const a = c.area >= minArea && c.area <= maxArea ? analyse(fg.labels, w, h, c, 'placeholder', 1) : null;
    if (a) candidates.push(a);
    else rejected.push(c);
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

  const backgroundColor = `#${hex(bg.r)}${hex(bg.g)}${hex(bg.b)}`;
  const ctx: GridContext = { w, h, data, bg, contentThreshold: Math.max(12, bg.noise * 2) };
  const grid = refineGrid(kept.map((a) => a.slot), ctx);
  const slots = readingOrder(grid.slots.sort((a, b) => b.confidence - a.confidence).slice(0, maxSlots));
  const texts = findTextLines(rejected, fg.labels, slots, notBg, ctx);
  if (slots.length === 0) {
    notes.push('No photo areas were found. Draw the slots by hand, or upload the design with transparent photo windows.');
    return { mode: 'none', slots, texts, artworkPlacement: 'below-photos', backgroundColor, notes };
  }
  notes.push(`Found ${slots.length} photo area${slots.length === 1 ? '' : 's'} on a ${backgroundColor} background. Customer photos will be placed over them.`);
  if (grid.filled > 0) {
    notes.push(`${grid.filled} of them ${grid.filled === 1 ? 'is a pale photo' : 'are pale photos'} placed from the grid the other photos line up on — check ${grid.filled === 1 ? 'it' : 'them'}.`);
  }
  if (grid.snapped) notes.push('The photo spaces were lined up on the design\'s grid so their edges match exactly.');
  if (texts.length > 0) {
    notes.push(
      `Found ${texts.length} line${texts.length === 1 ? '' : 's'} of wording. ${texts.length === 1 ? 'It was' : 'They were'} cleared from the design and turned into a text box customers can change — type the design's own wording as the default text.`
    );
  }
  const lowConfidence = slots.filter((s) => s.confidence < 0.6).length;
  if (lowConfidence > 0) notes.push(`${lowConfidence} area${lowConfidence === 1 ? ' is' : 's are'} uncertain — check them before publishing.`);
  return { mode: 'opaque', slots, texts, artworkPlacement: 'below-photos', backgroundColor, notes };
}

interface GridContext {
  w: number;
  h: number;
  data: Uint8ClampedArray | Uint8Array;
  bg: { r: number; g: number; b: number };
  /** A pixel further than this from the background colour is content. */
  contentThreshold: number;
}

interface PxBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

const toPx = (s: DetectedSlot, w: number, h: number): PxBox => ({ l: s.x * w, t: s.y * h, r: (s.x + s.width) * w, b: (s.y + s.height) * h });

function overlapArea(a: PxBox, b: PxBox): number {
  return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
}

/** Groups nearby values; returns the median of every group with at least two members. */
function clusterLines(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const lines: number[] = [];
  let group: number[] = [];
  const flush = () => {
    if (group.length >= 2) lines.push(group[Math.floor(group.length / 2)]);
    group = [];
  };
  for (const v of sorted) {
    if (group.length > 0 && v - group[group.length - 1] > tol) flush();
    group.push(v);
  }
  flush();
  return lines;
}

function nearestLine(v: number, lines: number[], tol: number): number | null {
  let best: number | null = null;
  for (const line of lines) if (Math.abs(line - v) <= tol && (best === null || Math.abs(line - v) < Math.abs(best - v))) best = line;
  return best;
}

/** Share of the box's pixels that are content (clearly not background). */
function contentShare(ctx: GridContext, box: PxBox): number {
  const { w, h, data, bg, contentThreshold } = ctx;
  const l = Math.max(0, Math.ceil(box.l));
  const t = Math.max(0, Math.ceil(box.t));
  const r = Math.min(w, Math.floor(box.r));
  const b = Math.min(h, Math.floor(box.b));
  let total = 0;
  let content = 0;
  for (let y = t; y < b; y++)
    for (let x = l; x < r; x++) {
      const o = (y * w + x) * 4;
      total++;
      if (Math.max(Math.abs(data[o] - bg.r), Math.abs(data[o + 1] - bg.g), Math.abs(data[o + 2] - bg.b)) > contentThreshold) content++;
    }
  return total === 0 ? 0 : content / total;
}

/**
 * Collage photos sit on a grid. Edges that nearly line up are snapped onto the
 * shared grid line, so every space is placed exactly, and a grid cell left
 * empty only because its photo is pale (a white dress, a bright sky — pixels
 * that look like the background) is filled in when it clearly holds content.
 */
function refineGrid(input: DetectedSlot[], ctx: GridContext): { slots: DetectedSlot[]; filled: number; snapped: boolean } {
  const { w, h } = ctx;
  const straight = input.filter((s) => s.rotationDeg === 0);
  if (straight.length < 4) return { slots: input, filled: 0, snapped: false };
  const tolX = Math.max(2, 0.012 * w);
  const tolY = Math.max(2, 0.012 * h);
  const boxes = straight.map((s) => toPx(s, w, h));
  const lefts = clusterLines(boxes.map((b) => b.l), tolX);
  const rights = clusterLines(boxes.map((b) => b.r), tolX);
  const tops = clusterLines(boxes.map((b) => b.t), tolY);
  const bottoms = clusterLines(boxes.map((b) => b.b), tolY);

  // Grid cells: a column span and a row span that match the size of a photo
  // already found. Only on a clear grid — enough photos sharing column and row lines.
  let cells: PxBox[] = [];
  if (straight.length >= 6 && lefts.length >= 3 && tops.length >= 3) {
    const widths = boxes.map((b) => b.r - b.l);
    const heights = boxes.map((b) => b.b - b.t);
    const spans = (starts: number[], ends: number[], known: number[], tol: number) =>
      starts.flatMap((a) => ends.filter((b) => b > a && known.some((k) => Math.abs(b - a - k) <= tol)).map((b) => [a, b] as [number, number]));
    const cols = spans(lefts, rights, widths, tolX);
    const rows = spans(tops, bottoms, heights, tolY);
    cells = cols.flatMap(([l, r]) => rows.map(([t, b]) => ({ l, r, t, b }))).sort((a, b) => (a.r - a.l) * (a.b - a.t) - (b.r - b.l) * (b.b - b.t));
  }
  const cellArea = (c: PxBox) => (c.r - c.l) * (c.b - c.t);
  const collides = (cell: PxBox, others: PxBox[]) => others.some((o) => overlapArea(o, cell) > 0.05 * Math.min(cellArea(cell), cellArea(o)));

  const rectShare = straight.filter((s) => s.shape === 'rect').length / straight.length;
  let snapped = false;
  const slots: DetectedSlot[] = [];
  const placed: PxBox[] = [];
  const pending = input.map((s) => (s.rotationDeg === 0 ? toPx(s, w, h) : null));
  input.forEach((s, index) => {
    if (s.rotationDeg !== 0) {
      slots.push(s);
      return;
    }
    const b = pending[index]!;
    const l = nearestLine(b.l, lefts, tolX);
    const r = nearestLine(b.r, rights, tolX);
    const t = nearestLine(b.t, tops, tolY);
    const bt = nearestLine(b.b, bottoms, tolY);
    let nb: PxBox = { l: l ?? b.l, r: r ?? b.r, t: t ?? b.t, b: bt ?? b.b };
    let onGrid = l !== null && r !== null && t !== null && bt !== null;
    if (!onGrid) {
      // Part of a pale photo (only its darker part stood out): it grows to the
      // smallest grid cell around it, if that cell is free.
      const others = [...placed, ...pending.filter((p, i): p is PxBox => p !== null && i > index)];
      const cell = cells.find((c) => c.l <= b.l + tolX && c.r >= b.r - tolX && c.t <= b.t + tolY && c.b >= b.b - tolY && !collides(c, others));
      if (cell) {
        nb = cell;
        onGrid = true;
      }
    }
    if (nb.l !== b.l || nb.r !== b.r || nb.t !== b.t || nb.b !== b.b) snapped = true;
    const next: DetectedSlot = { ...s, x: clamp01(nb.l / w), y: clamp01(nb.t / h), width: Math.min(1, (nb.r - nb.l) / w), height: Math.min(1, (nb.b - nb.t) / h) };
    // On a grid of plain rectangles, a sample photo read as a polygon or a rounded
    // box (its pale corners blending into the gutter) is a rectangle too.
    if (onGrid && rectShare >= 0.7 && (s.shape === 'polygon' || s.shape === 'rounded')) {
      next.shape = 'rect';
      delete next.polygon;
      delete next.cornerRadius;
      next.confidence = Math.max(s.confidence, 0.65);
    }
    slots.push(next);
    placed.push(nb);
  });

  // A grid cell left empty only because its whole photo is pale: filled when it clearly holds content.
  let filled = 0;
  for (const cell of cells) {
    if (collides(cell, placed)) continue;
    const inset = Math.max(1, 0.04 * Math.min(cell.r - cell.l, cell.b - cell.t));
    const inner = contentShare(ctx, { l: cell.l + inset, t: cell.t + inset, r: cell.r - inset, b: cell.b - inset });
    if (inner < 0.25) continue;
    slots.push({
      x: clamp01(cell.l / w),
      y: clamp01(cell.t / h),
      width: Math.min(1, (cell.r - cell.l) / w),
      height: Math.min(1, (cell.b - cell.t) / h),
      rotationDeg: 0,
      shape: 'rect',
      confidence: Math.round(Math.min(0.75, 0.45 + inner * 0.4) * 100) / 100,
      source: 'grid-cell',
    });
    placed.push(cell);
    filled++;
  }
  return { slots, filled, snapped };
}

/**
 * Printed wording on the background: small marks (letters) that are not photo
 * areas, sitting side by side on a shared line. Lines stacked closely are one
 * block. Each block becomes a proposed text box spanning the free space beside
 * the wording, so a customer's longer text still fits.
 */
function findTextLines(marks: Component[], labels: Int32Array, slots: DetectedSlot[], notBg: Uint8Array, ctx: GridContext): DetectedText[] {
  const { w, h, data } = ctx;
  const photoBoxes = slots.map((s) => toPx(s, w, h));
  const inPhoto = (c: Component) => {
    const cx = (c.minX + c.maxX + 1) / 2;
    const cy = (c.minY + c.maxY + 1) / 2;
    return photoBoxes.some((b) => cx >= b.l - 2 && cx <= b.r + 2 && cy >= b.t - 2 && cy <= b.b + 2);
  };
  const glyphs = marks
    .filter((c) => {
      const gh = c.maxY - c.minY + 1;
      const gw = c.maxX - c.minX + 1;
      return c.area >= 4 && gh >= 4 && gh <= 0.12 * h && gw <= 4 * gh && !c.touchesBorder && !inPhoto(c);
    })
    .slice(0, 3000);
  if (glyphs.length < 3) return [];

  // Union-find over glyphs that share a line.
  const parent = glyphs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const order = glyphs.map((_, i) => i).sort((a, b) => glyphs[a].minX - glyphs[b].minX);
  for (let ai = 0; ai < order.length; ai++) {
    const a = glyphs[order[ai]];
    const ah = a.maxY - a.minY + 1;
    for (let bi = ai + 1; bi < order.length; bi++) {
      const b = glyphs[order[bi]];
      const bh = b.maxY - b.minY + 1;
      const gap = b.minX - a.maxX;
      if (gap > 1.5 * Math.max(ah, bh, 8)) break;
      const vOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1;
      if (vOverlap >= 0.5 * Math.min(ah, bh) && Math.max(ah, bh) / Math.min(ah, bh) <= 2.5) parent[find(order[ai])] = find(order[bi]);
    }
  }
  interface Line {
    members: Component[];
    l: number;
    t: number;
    r: number;
    b: number;
    glyphHeight: number;
  }
  const groups = new Map<number, Component[]>();
  glyphs.forEach((g, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), g]);
  });
  const lines: Line[] = [];
  for (const members of groups.values()) {
    if (members.length < 3) continue;
    const l = Math.min(...members.map((m) => m.minX));
    const r = Math.max(...members.map((m) => m.maxX)) + 1;
    const t = Math.min(...members.map((m) => m.minY));
    const b = Math.max(...members.map((m) => m.maxY)) + 1;
    const heights = members.map((m) => m.maxY - m.minY + 1).sort((x, y) => x - y);
    const glyphHeight = heights[Math.floor(heights.length * 0.75)];
    if (r - l < 2 * (b - t)) continue;
    lines.push({ members, l, t, b, r, glyphHeight });
  }
  if (lines.length === 0) return [];

  // Stack lines that belong to one block (horizontally overlapping, close, similar size).
  lines.sort((a, b) => a.t - b.t);
  const blocks: Line[][] = [];
  for (const line of lines) {
    const block = blocks.find((bl) => {
      const last = bl[bl.length - 1];
      const overlap = Math.min(last.r, line.r) - Math.max(last.l, line.l);
      return overlap > 0 && line.t - last.b <= 1.0 * Math.max(last.glyphHeight, line.glyphHeight) && Math.max(last.glyphHeight, line.glyphHeight) / Math.min(last.glyphHeight, line.glyphHeight) <= 1.6;
    });
    if (block) block.push(line);
    else blocks.push([line]);
  }

  const texts: DetectedText[] = [];
  for (const block of blocks) {
    const members = block.flatMap((ln) => ln.members);
    const own = new Set(members.map((m) => m.id));
    const l = Math.min(...block.map((ln) => ln.l));
    const r = Math.max(...block.map((ln) => ln.r));
    const t = Math.min(...block.map((ln) => ln.t));
    const b = Math.max(...block.map((ln) => ln.b));
    const glyphHeight = Math.max(...block.map((ln) => ln.glyphHeight));
    // Capital letters are about 70% of the font size.
    const fontPx = glyphHeight / 0.7;

    // Ink colour: the strongest glyph pixels (the edges are blended with the background).
    const ink: number[] = [];
    for (let y = t; y < b; y++)
      for (let x = l; x < r; x++) {
        const p = y * w + x;
        if (own.has(labels[p])) ink.push(p);
      }
    if (ink.length === 0) continue;
    const dist = (p: number) => Math.max(Math.abs(data[p * 4] - ctx.bg.r), Math.abs(data[p * 4 + 1] - ctx.bg.g), Math.abs(data[p * 4 + 2] - ctx.bg.b));
    ink.sort((p, q) => dist(q) - dist(p));
    const core = ink.slice(0, Math.max(1, Math.ceil(ink.length * 0.4)));
    const avg = (k: number) => Math.round(core.reduce((sum, p) => sum + data[p * 4 + k], 0) / core.length);
    const color = `#${hex(avg(0))}${hex(avg(1))}${hex(avg(2))}`;

    // The box: the wording's rows with breathing room, widened symmetrically
    // over the free background beside it (stopping at photos or other marks).
    // Never reaching into the photos directly above or below the wording.
    const padY = 0.3 * fontPx;
    let boxT = Math.max(0, t - padY);
    let boxB = Math.min(h, b + padY);
    for (const pb of photoBoxes) {
      if (pb.r <= l || pb.l >= r) continue;
      if (pb.b <= t + 1) boxT = Math.max(boxT, pb.b + 1);
      if (pb.t >= b - 1) boxB = Math.min(boxB, pb.t - 1);
    }
    const blocked = (x: number) => {
      if (photoBoxes.some((pb) => x >= pb.l && x < pb.r && pb.t < boxB && pb.b > boxT)) return true;
      for (let y = Math.floor(boxT); y < Math.ceil(boxB); y++) {
        const p = y * w + x;
        if (notBg[p] && !own.has(labels[p])) return true;
      }
      return false;
    };
    const margin = Math.max(2, 0.4 * fontPx);
    let leftRoom = 0;
    for (let x = l - 1; x >= 0 && !blocked(x); x--) leftRoom++;
    let rightRoom = 0;
    for (let x = r; x < w && !blocked(x); x++) rightRoom++;
    const room = Math.max(0, Math.min(leftRoom, rightRoom) - margin);
    const boxL = Math.max(0, l - room);
    const boxR = Math.min(w, r + room);
    const erasePad = Math.max(2, 0.15 * fontPx);
    const el = Math.max(0, l - erasePad);
    const et = Math.max(0, t - erasePad);
    const er = Math.min(w, r + erasePad);
    const eb = Math.min(h, b + erasePad);
    texts.push({
      x: clamp01(boxL / w),
      y: clamp01(boxT / h),
      width: Math.min(1, (boxR - boxL) / w),
      height: Math.min(1, (boxB - boxT) / h),
      erase: { x: el / w, y: et / h, width: (er - el) / w, height: (eb - et) / h },
      color,
      fontSize: Math.round((fontPx / w) * 10000) / 10000,
      lines: block.length,
      align: 'center',
      confidence: Math.round(Math.min(0.9, 0.5 + members.length * 0.03) * 100) / 100,
    });
  }
  return texts.sort((a, b) => a.y - b.y);
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
  // A hero collage: one space at least twice the size of any other is filled
  // first, so a customer's first (usually favourite) photo lands there.
  const area = (d: DetectedSlot) => d.width * d.height;
  const bySize = [...input.detection.slots].sort((a, b) => area(b) - area(a));
  const hero = bySize.length > 1 && area(bySize[0]) >= 2 * area(bySize[1]) ? bySize[0] : null;
  const ordered = hero ? [hero, ...input.detection.slots.filter((d) => d !== hero)] : input.detection.slots;
  const photoSlots = ordered.map((s, i) => ({
    id: `photo_${String(i + 1).padStart(2, '0')}`,
    label: ordered.length === 1 ? 'Your photo' : s === hero ? 'Main photo' : `Photo ${i + 1}`,
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
  const texts = input.detection.texts ?? [];
  // Font sizes are authored against a 400px-wide editor (see the renderers).
  const editorPx = (fraction: number) => Math.round(fraction * 400 * 10) / 10;
  const textSlots = texts.map((t, i) => {
    const maxFont = Math.max(8, editorPx(t.fontSize));
    return {
      id: `text_${String(i + 1).padStart(2, '0')}`,
      label: texts.length === 1 ? 'Your text' : `Text ${i + 1}`,
      required: false,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      maxLength: Math.max(20, Math.min(120, 40 * t.lines)),
      align: t.align,
      defaultValue: '',
      defaultColor: t.color,
      minFontSizePx: Math.max(6, Math.round(maxFont * 0.5 * 10) / 10),
      maxFontSizePx: maxFont,
    };
  });
  const textLayers = textSlots.map((s) => ({ kind: 'text' as const, slotId: s.id }));
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
    textSlots,
    layers: [...(input.detection.artworkPlacement === 'above-photos' ? [...slotLayers, artworkLayer] : [artworkLayer, ...slotLayers]), ...textLayers],
  });
}
