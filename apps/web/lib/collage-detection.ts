import 'server-only';
import sharp from 'sharp';
import { detectPhotoSlots, type SlotDetectionResult } from '@bro-pics/shared';

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
