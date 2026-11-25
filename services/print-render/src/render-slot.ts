import sharp, { type OverlayOptions } from 'sharp';
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
  /** The slot is black & white: the photo is printed without colour. */
  grayscale?: boolean;
  /** A solid border hugging the photo's transparency (a cut-out's white sticker edge), its width in print pixels. */
  outline?: { color: string; widthPx: number } | null;
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
  const shaped = await renderShapedPhoto(input);
  return input.outline ? addOutline(shaped, input.outline.color, input.outline.widthPx) : shaped;
}

/** How many directions the outline is stamped in: the browser preview uses the same 32 (render-template.ts). */
const OUTLINE_STEPS = 32;

/**
 * Lays a solid border UNDER an RGBA image, following its transparency: the image's silhouette, filled with the
 * colour, is stamped all round at the border width and at half of it, then the image goes back on top. The same
 * construction as the browser preview's drawOutline (apps/web/components/customizer/render-template.ts), so the
 * printed edge matches what the customer approved. The result keeps the input's size.
 */
export async function addOutline(png: Buffer, color: string, widthPx: number): Promise<Buffer> {
  if (widthPx < 0.5) return png;
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color)?.[1] ?? 'ffffff';
  const fill = { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  const alpha = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
  const silhouette = await sharp({ create: { width, height, channels: 3, background: fill } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  // Stamped onto a canvas padded by the border width, so no offset is negative, then cut back to size.
  const pad = Math.ceil(widthPx);
  const stamps: OverlayOptions[] = [];
  for (const r of [widthPx, widthPx / 2]) {
    for (let i = 0; i < OUTLINE_STEPS; i++) {
      const a = (i / OUTLINE_STEPS) * Math.PI * 2;
      stamps.push({ input: silhouette, left: pad + Math.round(Math.cos(a) * r), top: pad + Math.round(Math.sin(a) * r) });
    }
  }
  const ring = await sharp({ create: { width: width + 2 * pad, height: height + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(stamps)
    .png()
    .toBuffer();
  return sharp(ring)
    .extract({ left: pad, top: pad, width, height })
    .png()
    .toBuffer()
    .then((cut) => sharp(cut).composite([{ input: png }]).png().toBuffer());
}

async function renderShapedPhoto(input: RenderSlotInput): Promise<Buffer> {
  const { photoBuffer, cropRect, rotationDeg, targetWidthPx, targetHeightPx, maskBuffer, grayscale } = input;

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

  // The crop is materialized to its own buffer BEFORE rotating/resizing. Chained
  // as one pipeline (extract -> rotate -> resize), sharp validates the extract
  // region against the post-rotation dimensions for a rotated, non-square crop and
  // throws "extract_area: bad extract area" — i.e. a customer who rotated their
  // photo AND zoomed/panned got a failed print job. (Same sharp quirk as the
  // extend/extract note above; confirmed against this build by
  // personalization-crop.test.ts, which checks every rotation pixel-by-pixel.)
  const cropped = await sharp(sourceBuffer, { limitInputPixels: false })
    .extract({
      left: left + padLeft,
      top: top + padTop,
      width,
      height,
    })
    .png()
    .toBuffer();

  let pipeline = sharp(cropped, { limitInputPixels: false })
    .rotate(rotationDeg) // sharp rotates clockwise for a positive degree, matching Konva's convention.
    .resize(targetWidthPx, targetHeightPx, { fit: 'fill' }); // 'fill': cropRect's aspect already matches the slot's, by construction — no letterboxing wanted.
  // Black & white keeps three sRGB channels (and the alpha), so it composites like any other photo.
  if (grayscale) pipeline = pipeline.grayscale().toColourspace('srgb');
  const extracted = await pipeline.ensureAlpha().png().toBuffer();

  if (!maskBuffer) return extracted;

  const resizedMask = await sharp(maskBuffer, { limitInputPixels: false })
    .resize(targetWidthPx, targetHeightPx, { fit: 'fill' })
    .toBuffer();

  return sharp(extracted)
    .composite([{ input: resizedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
