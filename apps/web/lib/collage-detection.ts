import 'server-only';
import sharp from 'sharp';
import { detectPhotoSlots, type DetectedText, type SlotDetectionResult } from '@bro-pics/shared';

/**
 * Server side of "upload a collage design, get a multi-photo template": decode
 * the admin's design, look for its photo areas (shared detectPhotoSlots) and
 * work out the print canvas the template should use.
 */

/** Long side the design is analysed at: enough to place slots to ~0.1% while staying fast. */
export const ANALYSIS_SIDE = 1200;

export interface CanvasPlan {
  canvas: { width: number; height: number; dpi: number };
  /** Physical print size the canvas represents. */
  widthIn: number;
  heightIn: number;
  /** Resolution the design itself prints at, at that size. */
  artworkDpi: number;
  warnings: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The template canvas always keeps the DESIGN's proportions (stretching the
 * artwork would distort it). With a print size, the design is fitted inside
 * it, turned to the same orientation; without one, it prints at its own
 * pixel size at `dpi`.
 */
export function planCanvas(input: { nativeWidth: number; nativeHeight: number; widthIn?: number; heightIn?: number; dpi?: number }): CanvasPlan {
  const dpi = input.dpi ?? 300;
  const { nativeWidth: nw, nativeHeight: nh } = input;
  const warnings: string[] = [];
  let widthIn: number;
  let heightIn: number;

  if (input.widthIn && input.heightIn) {
    let pw = input.widthIn;
    let ph = input.heightIn;
    // A portrait design for a frame listed as 12 × 8 means 8 × 12.
    if (pw !== ph && nw !== nh && pw > ph !== nw > nh) [pw, ph] = [ph, pw];
    const k = Math.min(pw / nw, ph / nh);
    widthIn = nw * k;
    heightIn = nh * k;
    const designAspect = nw / nh;
    const printAspect = pw / ph;
    if (Math.abs(printAspect - designAspect) / designAspect > 0.02) {
      warnings.push(
        `The design's proportions don't match a ${round1(pw)} × ${round1(ph)} in print, so it is fitted inside it at ${round1(widthIn)} × ${round1(heightIn)} in. Upload the design at the frame's proportions to fill it edge to edge.`
      );
    }
  } else {
    widthIn = nw / dpi;
    heightIn = nh / dpi;
  }

  const width = Math.max(1, Math.round(widthIn * dpi));
  const height = Math.max(1, Math.round(heightIn * dpi));
  const artworkDpi = Math.round(nw / widthIn);
  if (artworkDpi < 150) {
    warnings.push(
      `The design is only ${artworkDpi} DPI at ${round1(widthIn)} × ${round1(heightIn)} in, so its printed lines and borders will look soft. Upload it at least ${width} × ${height} px for a sharp print.`
    );
  } else if (artworkDpi < 250) {
    warnings.push(`The design prints at ${artworkDpi} DPI at this size: fine for most frames, but a ${width} × ${height} px file would be sharper.`);
  }
  return { canvas: { width, height, dpi }, widthIn: round1(widthIn), heightIn: round1(heightIn), artworkDpi, warnings };
}

export interface CollageAnalysis {
  detection: SlotDetectionResult;
  /** The design's own size, after applying its EXIF orientation. */
  native: { width: number; height: number; hasAlpha: boolean };
  /** The size the detection ran at. */
  analysed: { width: number; height: number };
}

export async function analyseCollage(image: Buffer): Promise<CollageAnalysis> {
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height) throw new Error('The file is not a readable image.');
  const turned = (meta.orientation ?? 1) >= 5;
  const native = { width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height, hasAlpha: Boolean(meta.hasAlpha) };

  const { data, info } = await sharp(image)
    .rotate()
    .resize({ width: ANALYSIS_SIDE, height: ANALYSIS_SIDE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const detection = detectPhotoSlots({ width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) });
  return { detection, native, analysed: { width: info.width, height: info.height } };
}

const parseHex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

/**
 * A copy of the design with its printed wording cleared, so a customer's own
 * text is not drawn over the original words. Each wording box is filled from
 * the background just outside it, blending left↔right and top↔bottom, so a
 * shaded background stays shaded. Works at the design's full size.
 */
export async function eraseTextAreas(image: Buffer, texts: DetectedText[], backgroundColor: string): Promise<{ data: Buffer; contentType: string; extension: string }> {
  const meta = await sharp(image).metadata();
  const { data, info } = await sharp(image).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const bg = parseHex(backgroundColor);
  const TOL = 28;
  const at = (x: number, y: number) => (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
  /** Average of up to three pixels stepping outward; anything not background-like counts as background. */
  const edge = (x: number, y: number, dx: number, dy: number): [number, number, number] => {
    const sum = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const o = at(x + dx * k, y + dy * k);
      const px = [data[o]!, data[o + 1]!, data[o + 2]!];
      const near = Math.max(Math.abs(px[0]! - bg[0]), Math.abs(px[1]! - bg[1]), Math.abs(px[2]! - bg[2])) <= TOL;
      for (let c = 0; c < 3; c++) sum[c]! += near ? px[c]! : bg[c]!;
    }
    return [sum[0]! / 3, sum[1]! / 3, sum[2]! / 3];
  };
  for (const t of texts) {
    const x0 = Math.max(0, Math.floor(t.erase.x * W));
    const y0 = Math.max(0, Math.floor(t.erase.y * H));
    const x1 = Math.min(W, Math.ceil((t.erase.x + t.erase.width) * W));
    const y1 = Math.min(H, Math.ceil((t.erase.y + t.erase.height) * H));
    if (x1 <= x0 || y1 <= y0) continue;
    // Smoothed along each edge so pixel noise does not streak across the fill.
    const radius = Math.max(2, Math.round(0.01 * Math.max(W, H)));
    const smooth = (line: Array<[number, number, number]>) =>
      line.map((_, i) => {
        const from = Math.max(0, i - radius);
        const to = Math.min(line.length, i + radius + 1);
        const acc: [number, number, number] = [0, 0, 0];
        for (let k = from; k < to; k++) for (let c = 0; c < 3; c++) acc[c] += line[k]![c]!;
        return acc.map((v) => v / (to - from)) as [number, number, number];
      });
    const left = smooth(Array.from({ length: y1 - y0 }, (_, i) => edge(x0 - 1, y0 + i, -1, 0)));
    const right = smooth(Array.from({ length: y1 - y0 }, (_, i) => edge(x1, y0 + i, 1, 0)));
    const top = smooth(Array.from({ length: x1 - x0 }, (_, i) => edge(x0 + i, y0 - 1, 0, -1)));
    const bottom = smooth(Array.from({ length: x1 - x0 }, (_, i) => edge(x0 + i, y1, 0, 1)));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const fx = (x - x0 + 0.5) / (x1 - x0);
        const fy = (y - y0 + 0.5) / (y1 - y0);
        const wh = 1 / Math.max(1e-3, Math.min(fx, 1 - fx) * (x1 - x0));
        const wv = 1 / Math.max(1e-3, Math.min(fy, 1 - fy) * (y1 - y0));
        const L = left[y - y0]!;
        const R = right[y - y0]!;
        const T = top[x - x0]!;
        const B = bottom[x - x0]!;
        const o = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const hv = L[c]! + (R[c]! - L[c]!) * fx;
          const vv = T[c]! + (B[c]! - T[c]!) * fy;
          data[o + c] = Math.round((hv * wh + vv * wv) / (wh + wv));
        }
      }
  }
  const out = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  if (meta.format === 'png' || meta.hasAlpha) return { data: await out.png().toBuffer(), contentType: 'image/png', extension: 'png' };
  return { data: await out.removeAlpha().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer(), contentType: 'image/jpeg', extension: 'jpg' };
}
