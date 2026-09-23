import sharp from 'sharp';
import type { Rect, RotationDeg } from '@bro-pics/shared';

export interface RenderSlotInput {
  /** The customer's ORIGINAL uploaded photo bytes — never the client's live-editing-session preview. */
  photoBuffer: Buffer;
  /**
   * Customization.transformJson.cropRect — already expressed in the
   * original photo's own pixel space (see packages/shared/src/
   * editor-geometry.ts's slotCropRectInOriginalPx, which derived it). This
   * is the whole reason server-side re-rendering at print resolution is
   * tractable without reconstructing the client's canvas transform chain
   * at a different pixel scale: cropRect already tells us exactly which
   * region of the original photo is visible, independent of what canvas
   * size produced it.
   */
  cropRect: Rect;
  rotationDeg: RotationDeg;
  /** The slot's size at PRINT resolution (print inches × DPI), not editor canvas pixels. */
  targetWidthPx: number;
  targetHeightPx: number;
  /** Authored at the slot's own aspect ratio — resized to match the target before compositing. */
  maskBuffer?: Buffer | null;
}

/**
 * Renders one photo slot at print resolution: extract the visible region
 * (cropRect) from the original photo, rotate it to match what the
 * customer saw, resize to fill the slot exactly, then apply the mask
 * (dest-in) if the template has one. Output is always targetWidthPx x
 * targetHeightPx RGBA PNG bytes, ready to composite onto the print canvas
 * at the slot's position.
 *
 * cropRect can legitimately extend outside the original photo's bounds
 * (a customer who zooms out or drags the photo partially off the slot
 * sees — and the print file must faithfully reproduce — transparent space
 * at that edge, not an error). Handled by extending the source image with
 * transparent padding before extracting, rather than clamping the crop
 * (which would silently show MORE of the photo than the customer actually
 * placed in the slot).
 */
export async function renderSlotPhoto(input: RenderSlotInput): Promise<Buffer> {
  const { photoBuffer, cropRect, rotationDeg, targetWidthPx, targetHeightPx, maskBuffer } = input;

  const photo = sharp(photoBuffer, { limitInputPixels: false });
  const metadata = await photo.metadata();
  const photoWidth = metadata.width ?? 0;
  const photoHeight = metadata.height ?? 0;

  const left = Math.round(cropRect.x);
  const top = Math.round(cropRect.y);
  const width = Math.round(cropRect.width);
  const height = Math.round(cropRect.height);

  // How far the requested crop spills outside the actual photo, per edge —
  // 0 when fully in-bounds. Padding the source by these amounts (all in
  // ORIGINAL-photo pixel space, before rotation) means the subsequent
  // .extract() always targets valid in-bounds coordinates.
  const padLeft = Math.max(0, -left);
  const padTop = Math.max(0, -top);
  const padRight = Math.max(0, left + width - photoWidth);
  const padBottom = Math.max(0, top + height - photoHeight);

  // sharp rejects .extract() chained directly after .extend() in the same
  // pipeline — it validates the extract region against the pipeline's
  // ORIGINAL input dimensions, not the post-extend size (confirmed
  // directly against this sharp build, not assumed: chaining throws
  // "extract_area: bad extract area" even for an in-bounds region of the
  // extended image; materializing the extend to a buffer first, then
  // starting a fresh pipeline from that buffer, works). So the padded
  // buffer must be fully materialized before extracting from it.
  const needsPadding = padLeft > 0 || padTop > 0 || padRight > 0 || padBottom > 0;
  const sourceBuffer = needsPadding
    ? await sharp(photoBuffer, { limitInputPixels: false })
        .ensureAlpha()
        .extend({
          left: padLeft,
          top: padTop,
          right: padRight,
          bottom: padBottom,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer()
    : photoBuffer;

  const extracted = await sharp(sourceBuffer, { limitInputPixels: false })
    .extract({
      left: left + padLeft,
      top: top + padTop,
      width,
      height,
    })
    .rotate(rotationDeg) // sharp rotates clockwise for a positive degree, matching Konva's convention.
    .resize(targetWidthPx, targetHeightPx, { fit: 'fill' }) // 'fill': cropRect's aspect already matches the slot's, by construction — no letterboxing wanted.
    .ensureAlpha()
    .png()
    .toBuffer();

  if (!maskBuffer) return extracted;

  const resizedMask = await sharp(maskBuffer, { limitInputPixels: false })
    .resize(targetWidthPx, targetHeightPx, { fit: 'fill' })
    .toBuffer();

  return sharp(extracted)
    .composite([{ input: resizedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
