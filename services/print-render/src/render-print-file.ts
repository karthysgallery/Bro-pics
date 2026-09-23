import sharp from 'sharp';
import { fractionRectToCanvasRect, type Rect, type RotationDeg } from '@bro-pics/shared';
import { renderSlotPhoto } from './render-slot';

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
  clipart?: { buffer: Buffer; rect: Rect } | null;
}

// Matches apps/web/lib/design-tokens.ts's PAPER — duplicated rather than
// imported since services/print-render must not depend on apps/web.
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Assembles one print-ready file at print resolution (print inches × DPI),
 * replicating EditorCanvas.tsx's compositing order exactly: background,
 * every slot's masked photo, mockup (the frame graphic — drawn ON TOP of
 * the photo layer, since the mockup PNG has a transparent cutout where the
 * photo shows through), overlay, then clipart. Text personalization is
 * deliberately NOT rendered here yet — see PROJECT_STATUS.md for why
 * (custom Google Font delivery to sharp/librsvg needs verification against
 * a real Linux deployment target this sandbox can't provide; a base64
 * @font-face embed was tried and confirmed to silently fall back to a
 * generic font rather than erroring, which would be a much worse failure
 * mode on a real printed, shipped product than not rendering text at all).
 */
export async function renderPrintFile(input: RenderPrintFileInput): Promise<Buffer> {
  const { printWidthPx, printHeightPx, slots, mockupBuffer, overlayBuffer, clipart } = input;

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

  const clipartComposite = [];
  if (clipart) {
    const rect = fractionRectToCanvasRect(clipart.rect, printWidthPx, printHeightPx);
    const resized = await sharp(clipart.buffer, { limitInputPixels: false })
      .resize(rect.width, rect.height, { fit: 'fill' })
      .toBuffer();
    clipartComposite.push({ input: resized, left: rect.x, top: rect.y });
  }

  return sharp({
    create: { width: printWidthPx, height: printHeightPx, channels: 4, background: BACKGROUND },
  })
    .composite([...slotComposites, { input: resizedMockup, left: 0, top: 0 }, ...overlayComposite, ...clipartComposite])
    .png()
    .toBuffer();
}
