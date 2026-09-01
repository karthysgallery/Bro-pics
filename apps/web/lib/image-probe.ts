import sharp from 'sharp';

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

/**
 * Probes real image dimensions from the actual bytes (never trust a
 * client-reported width/height) and re-encodes through sharp, which
 * strips EXIF/metadata by default on re-encode.
 *
 * `.rotate()` (no argument) auto-orients the pixels from the EXIF
 * `Orientation` tag BEFORE re-encoding — a portrait phone photo shot with
 * Orientation 6/8 must come out right-side-up, not sideways. Because a
 * 90°/270° auto-rotation swaps width and height, widthPx/heightPx are read
 * from the ROTATED output's own metadata (via `resolveWithObject`), never
 * from the original (pre-rotation) input metadata — otherwise every
 * downstream DPI/crop calculation would be transposed relative to what the
 * customer actually sees.
 */
export async function probeAndStripImage(buffer: Buffer): Promise<ProbedImage> {
  const inputMetadata = await sharp(buffer).metadata();
  const format = inputMetadata.format;

  if (!inputMetadata.width || !inputMetadata.height || !format) {
    throw new Error('Unable to read image dimensions or format');
  }

  const mime = FORMAT_TO_MIME[format];
  if (!mime) {
    throw new Error(`Unsupported image format: ${format}`);
  }

  const { data: strippedBuffer, info } = await sharp(buffer)
    .rotate()
    .toFormat(format as 'jpeg' | 'png' | 'webp')
    .toBuffer({ resolveWithObject: true });

  return {
    widthPx: info.width,
    heightPx: info.height,
    mime,
    strippedBuffer,
  };
}
