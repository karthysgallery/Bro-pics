import sharp from 'sharp';
import { fractionRectToCanvasRect, type Rect, type RotationDeg } from '@bro-pics/shared';
import { renderSlotPhoto } from './render-slot';
import { buildTextZoneSvg, type PrintTextField } from './render-text';

export interface PrintSlotInput {
  /** FrameTemplate.printableRects[i] — fractions (0-1) of the print canvas. */
  rect: Rect;
  photoBuffer: Buffer;
  /** Customization.transformJson.cropRect for this slot, in the original photo's own pixel space. */
  cropRect: Rect;
  rotationDeg: RotationDeg;
  maskBuffer?: Buffer | null;
}

export interface RenderPrintFileInput {
  printWidthPx: number;
  printHeightPx: number;
  slots: PrintSlotInput[];
  mockupBuffer: Buffer;
  overlayBuffer?: Buffer | null;
  /** Personalized text fields — optional for backwards compat. Old jobs
   *  and callers that predate text rendering continue to work unchanged. */
  textFields?: PrintTextField[];
  clipart?: { buffer: Buffer; rect: Rect } | null;
}

// Matches apps/web/lib/design-tokens.ts's PAPER — duplicated rather than
// imported since services/print-render must not depend on apps/web.
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Assembles one print-ready file at print resolution (print inches × DPI),
 * replicating EditorCanvas.tsx's compositing order exactly:
 *   Layer 0: white background
 *   Layer 1: every slot's masked photo
 *   Layer 2: mockup (frame graphic — transparent cutout shows photos)
 *   Layer 3: overlay (glass glare, embossed border)
 *   Layer 4: personalized text zones (SVG → librsvg → PNG)
 *   Layer 5: clipart stickers
 */
export async function renderPrintFile(input: RenderPrintFileInput): Promise<Buffer> {
  const { printWidthPx, printHeightPx, slots, mockupBuffer, overlayBuffer, textFields, clipart } = input;

  const slotComposites = await Promise.all(
    slots.map(async (slot) => {
      const canvasRect = fractionRectToCanvasRect(slot.rect, printWidthPx, printHeightPx);
      const rendered = await renderSlotPhoto({
        photoBuffer: slot.photoBuffer,
        cropRect: slot.cropRect,
        rotationDeg: slot.rotationDeg,
        targetWidthPx: canvasRect.width,
        targetHeightPx: canvasRect.height,
        maskBuffer: slot.maskBuffer,
      });
      return { input: rendered, left: canvasRect.x, top: canvasRect.y };
    })
  );

  const resizedMockup = await sharp(mockupBuffer, { limitInputPixels: false })
    .resize(printWidthPx, printHeightPx, { fit: 'fill' })
    .toBuffer();

  const overlayComposite = overlayBuffer
    ? [
        {
          input: await sharp(overlayBuffer, { limitInputPixels: false })
            .resize(printWidthPx, printHeightPx, { fit: 'fill' })
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ]
    : [];

  // Text composites — SVG rendered via Sharp's librsvg at full print resolution
  const textComposites: Array<{ input: Buffer; left: number; top: number }> = [];
  if (textFields?.length) {
    for (const field of textFields) {
      if (!field.value.trim()) continue;
      const svgBuffer = buildTextZoneSvg(field, printWidthPx, printHeightPx);
      textComposites.push({ input: svgBuffer, left: 0, top: 0 });
    }
  }

  const clipartComposite: Array<{ input: Buffer; left: number; top: number }> = [];
  if (clipart) {
    const rect = fractionRectToCanvasRect(clipart.rect, printWidthPx, printHeightPx);
    const resized = await sharp(clipart.buffer, { limitInputPixels: false })
      .resize(rect.width, rect.height, { fit: 'fill' })
      .toBuffer();
    clipartComposite.push({ input: resized, left: rect.x, top: rect.y });
  }

  // Composite order matches EditorCanvas: bg → photos → mockup → overlay → text → clipart
  return sharp({
    create: { width: printWidthPx, height: printHeightPx, channels: 4, background: BACKGROUND },
  })
    .composite([
      ...slotComposites,
      { input: resizedMockup, left: 0, top: 0 },
      ...overlayComposite,
      ...textComposites,
      ...clipartComposite,
    ])
    .png()
    .toBuffer();
}
