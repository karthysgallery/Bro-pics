import sharp from 'sharp';
import { isLikelyHeic, convertHeicToJpeg } from './heic-convert';

export interface ProbedImage {
  widthPx: number;
  heightPx: number;
  mime: string;
  strippedBuffer: Buffer;
}

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// A decompression-bomb guard: sharp decodes eagerly, so an attacker-sized
// (dimension-wise, not necessarily byte-wise) image can exhaust memory
// before any of this function's own checks run. 120 MP comfortably covers
// even a 20x30in print at 300 DPI (54 MP) with headroom.
const MAX_INPUT_PIXELS = 120_000_000;

/**
 * Probes real image dimensions from the actual bytes (never trust a
 * client-reported width/height) and re-encodes through sharp, which
 * strips EXIF/metadata by default on re-encode.
 *
 * HEIC/HEIF input (real iPhone photos) is converted to JPEG first — sharp/
 * libvips' own HEIF support on the prebuilt binaries this project uses is
 * AVIF-only (HEVC decode is patent-encumbered and excluded), so without
 * this every iPhone photo shot in HEIC format would fail outright. See
 * lib/heic-convert.ts for why heic-convert specifically.
 *
 * `.rotate()` (no argument) auto-orients the pixels from the EXIF
 * `Orientation` tag BEFORE re-encoding — a portrait phone photo shot with
 * Orientation 6/8 must come out right-side-up, not sideways. Because a
 * 90°/270° auto-rotation swaps width and height, widthPx/heightPx are read
 * from the ROTATED output's own metadata (via `resolveWithObject`), never
 * from the original (pre-rotation) input metadata — otherwise every
 * downstream DPI/crop calculation would be transposed relative to what the
 * customer actually sees.
 *
 * `.toColourspace('srgb')` forces conversion of a wide-gamut source (real
 * iPhone photos are commonly tagged Display P3, not sRGB) using its
 * embedded ICC profile — without this, sharp preserves the original pixel
 * values as-is on re-encode, which then get misinterpreted as sRGB by
 * every downstream consumer (the browser canvas, the eventual print
 * pipeline), shifting colours (most visibly, oversaturated reds/greens).
 */
export async function probeAndStripImage(rawBuffer: Buffer): Promise<ProbedImage> {
  const buffer = isLikelyHeic(rawBuffer) ? await convertHeicToJpeg(rawBuffer) : rawBuffer;

  const inputMetadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const format = inputMetadata.format;

  if (!inputMetadata.width || !inputMetadata.height || !format) {
    throw new Error('Unable to read image dimensions or format');
  }

  const mime = FORMAT_TO_MIME[format];
  if (!mime) {
    throw new Error(`Unsupported image format: ${format}`);
  }

  const { data: strippedBuffer, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .toColourspace('srgb')
    .toFormat(format as 'jpeg' | 'png' | 'webp')
    .toBuffer({ resolveWithObject: true });

  return {
    widthPx: info.width,
    heightPx: info.height,
    mime,
    strippedBuffer,
  };
}
