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
 */
export async function probeAndStripImage(buffer: Buffer): Promise<ProbedImage> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error('Unable to read image dimensions or format');
  }

  const mime = FORMAT_TO_MIME[metadata.format];
  if (!mime) {
    throw new Error(`Unsupported image format: ${metadata.format}`);
  }

  const strippedBuffer = await image.toFormat(metadata.format as 'jpeg' | 'png' | 'webp').toBuffer();

  return {
    widthPx: metadata.width,
    heightPx: metadata.height,
    mime,
    strippedBuffer,
  };
}
