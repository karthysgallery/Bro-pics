import sharp from 'sharp';
import { EDITOR_CANVAS_SIZE, isInsidePrintArea, legacyPrintLayout, rectOnPaper, type FractionRect, type Rect, type RotationDeg } from '@bro-pics/shared';
import { renderSlotPhoto } from './render-slot';
import { buildTextZoneSvg, type PrintTextField } from './render-text';

/**
 * The print file for a frame template: ONLY what is physically printed.
 *
 *   paper   = the variant's print size in pixels (turned to the design's orientation)
 *   content = the template's print area, fitted inside the paper, aspect kept
 *   layers  = white paper -> customer photos -> printed artwork -> text -> chosen clipart
 *
 * The frame/lifestyle mockup and the glass overlay are presentation only and
 * are never passed in here. Text or clipart placed outside the print area
 * (e.g. on the picture of the wooden frame) is not printed — the admin
 * template editor warns about that (legacyTemplatePrintWarnings).
 */
export interface LegacyPrintSlot {
  rect: FractionRect;
  photoBuffer: Buffer;
  /** Customization.transformJson.cropRect, in the original photo's own pixels. */
  cropRect: Rect;
  rotationDeg: RotationDeg;
  maskBuffer?: Buffer | null;
}

export interface RenderLegacyPrintInput {
  template: { printableRects: ReadonlyArray<FractionRect & { slotIndex: number }>; printArea?: FractionRect | null };
  /** The variant's printWidthPx × printHeightPx. */
  paperPx: { width: number; height: number };
  slots: LegacyPrintSlot[];
  /** Printed decoration, authored over the whole editor canvas (same coordinates as the mockup). */
  printArtworkBuffer?: Buffer | null;
  /** zoneRect in editor-canvas fractions. */
  textFields?: PrintTextField[];
  clipart?: { buffer: Buffer; rect: FractionRect } | null;
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function toPx(rect: FractionRect): PxRect {
  const left = Math.round(rect.x);
  const top = Math.round(rect.y);
  return { left, top, width: Math.max(1, Math.round(rect.x + rect.width) - left), height: Math.max(1, Math.round(rect.y + rect.height) - top) };
}

/** Composites `buffer` (exactly `rect` sized) onto the paper, cutting off whatever falls past its edge. */
async function clipped(buffer: Buffer, rect: PxRect, paperWidth: number, paperHeight: number) {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(paperWidth, rect.left + rect.width);
  const bottom = Math.min(paperHeight, rect.top + rect.height);
  if (right <= left || bottom <= top) return null;
  if (left === rect.left && top === rect.top && right - left === rect.width && bottom - top === rect.height) {
    return { input: buffer, left, top };
  }
  const input = await sharp(buffer, { limitInputPixels: false })
    .extract({ left: left - rect.left, top: top - rect.top, width: right - left, height: bottom - top })
    .toBuffer();
  return { input, left, top };
}

export async function renderLegacyPrintFile(input: RenderLegacyPrintInput): Promise<Buffer> {
  const layout = legacyPrintLayout(input.template, input.paperPx);
  const paperWidth = Math.round(layout.paperWidth);
  const paperHeight = Math.round(layout.paperHeight);
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  // 1. Customer photos.
  for (const slot of input.slots) {
    const target = toPx(rectOnPaper(slot.rect, layout));
    const photo = await renderSlotPhoto({
      photoBuffer: slot.photoBuffer,
      cropRect: slot.cropRect,
      rotationDeg: slot.rotationDeg,
      targetWidthPx: target.width,
      targetHeightPx: target.height,
      maskBuffer: slot.maskBuffer,
    });
    const placed = await clipped(photo, target, paperWidth, paperHeight);
    if (placed) composites.push(placed);
  }

  // 2. Printed artwork: crop the visible part out of the full-canvas asset
  //    first, then scale only that — never upscale the whole canvas.
  if (input.printArtworkBuffer) {
    const full = rectOnPaper({ x: 0, y: 0, width: 1, height: 1 }, layout);
    const left = Math.max(0, Math.round(full.x));
    const top = Math.max(0, Math.round(full.y));
    const right = Math.min(paperWidth, Math.round(full.x + full.width));
    const bottom = Math.min(paperHeight, Math.round(full.y + full.height));
    if (right > left && bottom > top) {
      const meta = await sharp(input.printArtworkBuffer, { limitInputPixels: false }).metadata();
      const srcW = meta.width ?? 1;
      const srcH = meta.height ?? 1;
      const sx = Math.max(0, Math.floor(((left - full.x) / full.width) * srcW));
      const sy = Math.max(0, Math.floor(((top - full.y) / full.height) * srcH));
      const sw = Math.max(1, Math.min(srcW - sx, Math.ceil(((right - left) / full.width) * srcW)));
      const sh = Math.max(1, Math.min(srcH - sy, Math.ceil(((bottom - top) / full.height) * srcH)));
      const art = await sharp(input.printArtworkBuffer, { limitInputPixels: false })
        .extract({ left: sx, top: sy, width: sw, height: sh })
        .resize(right - left, bottom - top, { fit: 'fill' })
        .png()
        .toBuffer();
      composites.push({ input: art, left, top });
    }
  }

  // 3. Text that sits on the printed area.
  for (const field of input.textFields ?? []) {
    if (!field.value.trim() || !isInsidePrintArea(field.zoneRect, layout.area)) continue;
    const zone = rectOnPaper(field.zoneRect, layout);
    const onPaper: PrintTextField = {
      ...field,
      zoneRect: { x: zone.x / paperWidth, y: zone.y / paperHeight, width: zone.width / paperWidth, height: zone.height / paperHeight },
    };
    // Font sizes are authored in editor pixels; tell the text renderer how
    // many editor pixels the paper's width represents so they scale exactly
    // like the photos do.
    const editorPxAcrossPaper = (EDITOR_CANVAS_SIZE * paperWidth) / layout.unitsPerCanvas;
    composites.push({ input: buildTextZoneSvg(onPaper, paperWidth, paperHeight, editorPxAcrossPaper), left: 0, top: 0 });
  }

  // 4. Clipart the customer chose, when it sits on the printed area.
  if (input.clipart && isInsidePrintArea(input.clipart.rect, layout.area)) {
    const target = toPx(rectOnPaper(input.clipart.rect, layout));
    const sticker = await sharp(input.clipart.buffer, { limitInputPixels: false }).resize(target.width, target.height, { fit: 'fill' }).png().toBuffer();
    const placed = await clipped(sticker, target, paperWidth, paperHeight);
    if (placed) composites.push(placed);
  }

  return sharp({ create: { width: paperWidth, height: paperHeight, channels: 4, background: WHITE } })
    .composite(composites)
    .png()
    .toBuffer();
}
