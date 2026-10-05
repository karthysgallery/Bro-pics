import sharp from 'sharp';

export interface Point {
  x: number;
  y: number;
}
/** Four corners, clockwise from top-left: TL, TR, BR, BL. */
export type Quad = readonly [Point, Point, Point, Point];

/**
 * 3x3 projective transform (row-major) mapping the unit square onto `quad`
 * (Heckbert's square-to-quad). Used to place flat artwork in a photographed scene with
 * correct perspective — a wall frame seen at an angle, a table stand receding from the
 * viewer — which a plain resize/rotate cannot do.
 */
export function squareToQuad(q: Quad): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g: number, h: number;
  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    g = 0; h = 0; // affine (a parallelogram): no perspective component
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

/** A usable quad: finite corners, real area, and convex (a bow-tie or collapsed quad can't hold a picture). */
export function assertValidQuad(q: Quad): void {
  if (q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Scene quad has a non-finite corner');
  let area2 = 0;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    area2 += a.x * b.y - b.x * a.y;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-9) {
      if (sign !== 0 && Math.sign(cross) !== sign) throw new Error('Scene quad is not convex (corners out of order or crossed)');
      sign = Math.sign(cross);
    }
  }
  if (Math.abs(area2) / 2 < 1) throw new Error('Degenerate scene quad (almost zero area)');
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Degenerate scene quad (cannot be inverted)');
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/**
 * Warps `artwork` (any image Sharp reads) onto `quad` inside an outWidth x outHeight
 * transparent RGBA canvas. Inverse-maps each output pixel to artwork space with bilinear
 * sampling, and 2x2 supersamples the edge so the quad's border is anti-aliased.
 * Pure CPU on raw buffers: fine for server-side previews (~1-2 MP), not meant for print size.
 */
export async function warpToQuad(artwork: Buffer, quad: Quad, outWidth: number, outHeight: number): Promise<Buffer> {
  assertValidQuad(quad);
  const { data: src, info } = await sharp(artwork).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sw = info.width, sh = info.height;
  const out = Buffer.alloc(outWidth * outHeight * 4); // transparent black

  const inv = invert3(squareToQuad(quad));
  const minX = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))));
  const maxX = Math.min(outWidth - 1, Math.ceil(Math.max(...quad.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))));
  const maxY = Math.min(outHeight - 1, Math.ceil(Math.max(...quad.map((p) => p.y))));

  const sample = (u: number, v: number, acc: number[]): boolean => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const fx = u * (sw - 1), fy = v * (sh - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 4; c++) {
      const top = src[(y0 * sw + x0) * 4 + c] * (1 - tx) + src[(y0 * sw + x1) * 4 + c] * tx;
      const bottom = src[(y1 * sw + x0) * 4 + c] * (1 - tx) + src[(y1 * sw + x1) * 4 + c] * tx;
      acc[c] += top * (1 - ty) + bottom * ty;
    }
    return true;
  };

  const offsets = [0.25, 0.75];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const acc = [0, 0, 0, 0];
      let hits = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const px = x + ox, py = y + oy;
          const w = inv[6] * px + inv[7] * py + inv[8];
          if (w <= 0) continue;
          if (sample((inv[0] * px + inv[1] * py + inv[2]) / w, (inv[3] * px + inv[4] * py + inv[5]) / w, acc)) hits++;
        }
      }
      if (hits === 0) continue;
      const i = (y * outWidth + x) * 4;
      // Colour averaged over the sub-samples that landed inside; alpha scaled by coverage (anti-aliased edge).
      out[i] = acc[0] / hits;
      out[i + 1] = acc[1] / hits;
      out[i + 2] = acc[2] / hits;
      out[i + 3] = (acc[3] / hits) * (hits / 4);
    }
  }
  return sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toBuffer();
}
