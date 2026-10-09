import type { PhotoSlot, TemplateCanvas } from './template-schema';

import type { Rect, RotationDeg } from '../editor-geometry';

/** The editor's existing rotation type (0/90/180/270) — reused so both agree. */
export type Rotation = RotationDeg;

/**
 * The customer's placement of a photo in a slot, in resolution-independent terms.
 *  - scale   : zoom as a MULTIPLE of the "cover" scale. 1 = the photo just covers the
 *              slot (the automatic fit); 2 = zoomed in 2x. Never below `MIN_SCALE`.
 *  - offsetX/Y: how far the photo's centre is moved from the slot's centre, as a
 *              FRACTION of the slot's width/height. 0,0 = centred.
 * Because nothing here is in pixels, the same transform describes the editor
 * canvas, every mockup and the 300-DPI print — they cannot disagree.
 */
export interface PhotoTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_TRANSFORM: PhotoTransform = { scale: 1, offsetX: 0, offsetY: 0 };

/** Zooming out below "cover" would leave empty slot area; we don't allow it. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Slot rectangle in pixels of a canvas of the given pixel size. */
export function slotRectPx(slot: Pick<PhotoSlot, 'x' | 'y' | 'width' | 'height'>, canvasWidth: number, canvasHeight: number): Rect {
  return {
    x: Math.round(slot.x * canvasWidth),
    y: Math.round(slot.y * canvasHeight),
    width: Math.max(1, Math.round(slot.width * canvasWidth)),
    height: Math.max(1, Math.round(slot.height * canvasHeight)),
  };
}

/** Width / height of a slot in canvas pixels (fractions of different axes, so not simply width/height). */
export function slotAspectRatio(slot: Pick<PhotoSlot, 'width' | 'height'>, canvas: Pick<TemplateCanvas, 'width' | 'height'>): number {
  return (slot.width * canvas.width) / (slot.height * canvas.height);
}

/** Pixel size of a photo after the customer's rotation (90/270 swap the axes). */
export function rotatedSize(photoWidth: number, photoHeight: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: photoHeight, height: photoWidth } : { width: photoWidth, height: photoHeight };
}

/**
 * The automatic fit when a photo first lands in a slot: centred, covering,
 * not zoomed. (Cover-fit, per the brief: never stretch, never leave gaps.)
 */
export function fitPhotoToSlot(): PhotoTransform {
  return { ...IDENTITY_TRANSFORM };
}

/**
 * Keeps the photo covering the slot: the visible window may not slide past the
 * photo's edges. Applied after every pan/zoom so the customer can never drag the
 * photo off and expose empty slot area.
 */
export function clampTransform(
  transform: PhotoTransform,
  photoWidth: number,
  photoHeight: number,
  slotAspect: number
): PhotoTransform {
  const scale = clampScale(transform.scale);
  // Work in "slot units" where the slot is slotAspect wide and 1 tall.
  const coverScale = Math.max(slotAspect / photoWidth, 1 / photoHeight);
  const drawnW = photoWidth * coverScale * scale;
  const drawnH = photoHeight * coverScale * scale;
  // The photo may move until its edge meets the slot edge: half the surplus, as a fraction of the slot size.
  const maxX = Math.max(0, (drawnW - slotAspect) / 2) / slotAspect;
  const maxY = Math.max(0, (drawnH - 1) / 2);
  return {
    scale,
    offsetX: Math.min(maxX, Math.max(-maxX, finiteOr0(transform.offsetX))),
    offsetY: Math.min(maxY, Math.max(-maxY, finiteOr0(transform.offsetY))),
  };
}

function finiteOr0(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * The region of the (rotated) photo that is visible in the slot, in that
 * rotated photo's own pixels. This is the single source of truth for what is
 * shown: the editor draws it, mockups use it, and print crops exactly it.
 */
export function visibleRegion(
  photoWidth: number,
  photoHeight: number,
  rotation: Rotation,
  slotAspect: number,
  transform: PhotoTransform
): Rect {
  const rot = rotatedSize(photoWidth, photoHeight, rotation);
  const t = clampTransform(transform, rot.width, rot.height, slotAspect);
  const coverScale = Math.max(slotAspect / rot.width, 1 / rot.height); // slot-units per photo px
  const s = coverScale * t.scale;
  const cropW = slotAspect / s;
  const cropH = 1 / s;
  // Photo centre displaced by offset*slot size => the visible window moves the opposite way.
  const cx = rot.width / 2 - (t.offsetX * slotAspect) / s;
  const cy = rot.height / 2 - (t.offsetY * 1) / s;
  return { x: cx - cropW / 2, y: cy - cropH / 2, width: cropW, height: cropH };
}

/**
 * Maps a rectangle expressed in the ROTATED photo's pixel space back to the
 * ORIGINAL photo's pixel space — what the existing print renderer expects
 * (it extracts from the original, then rotates), so the two stay compatible.
 */
export function rectToOriginalSpace(rect: Rect, photoWidth: number, photoHeight: number, rotation: Rotation): Rect {
  const { x, y, width: w, height: h } = rect;
  switch (rotation) {
    case 0:
      return { x, y, width: w, height: h };
    case 90:
      return { x: y, y: photoHeight - (x + w), width: h, height: w };
    case 180:
      return { x: photoWidth - (x + w), y: photoHeight - (y + h), width: w, height: h };
    case 270:
      return { x: photoWidth - (y + h), y: x, width: h, height: w };
  }
}

/** Crop rectangle in the ORIGINAL photo's pixels — directly usable as Customization.transformJson.cropRect. */
export function cropRectInOriginalPx(
  photoWidth: number,
  photoHeight: number,
  rotation: Rotation,
  slotAspect: number,
  transform: PhotoTransform
): Rect {
  return rectToOriginalSpace(visibleRegion(photoWidth, photoHeight, rotation, slotAspect, transform), photoWidth, photoHeight, rotation);
}

/** Inverse of visibleRegion: recover the transform from a visible region (used to restore saved legacy cropRects). */
export function transformFromVisibleRegion(
  region: Rect,
  photoWidth: number,
  photoHeight: number,
  rotation: Rotation,
  slotAspect: number
): PhotoTransform {
  const rot = rotatedSize(photoWidth, photoHeight, rotation);
  const coverScale = Math.max(slotAspect / rot.width, 1 / rot.height);
  const s = slotAspect / region.width; // slot-units per photo px actually used
  const scale = s / coverScale;
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  return {
    scale,
    offsetX: ((rot.width / 2 - cx) * s) / slotAspect,
    offsetY: (rot.height / 2 - cy) * s,
  };
}

/** Inverse of rectToOriginalSpace: a crop stored in original pixels -> the rotated space. */
export function rectToRotatedSpace(rect: Rect, photoWidth: number, photoHeight: number, rotation: Rotation): Rect {
  switch (rotation) {
    case 0:
      return { ...rect };
    case 90:
      return { x: photoHeight - (rect.y + rect.height), y: rect.x, width: rect.height, height: rect.width };
    case 180:
      return { x: photoWidth - (rect.x + rect.width), y: photoHeight - (rect.y + rect.height), width: rect.width, height: rect.height };
    case 270:
      return { x: rect.y, y: photoWidth - (rect.x + rect.width), width: rect.height, height: rect.width };
  }
}

/** A frame's physical print area in inches (a variant's widthIn × heightIn). */
export interface PrintSizeIn {
  width: number;
  height: number;
}

/**
 * How wide (in inches) the template canvas actually prints. Without a frame
 * size that is the canvas's own size (pixels / dpi). With one — the same
 * collage offered in several sizes — the canvas is turned to the frame's
 * orientation and fitted inside it, so DPI checks follow the size the
 * customer is buying rather than the size the template was drawn at.
 */
export function canvasPrintWidthIn(canvas: Pick<TemplateCanvas, 'width' | 'dpi'> & { height?: number }, printSize?: PrintSizeIn): number {
  if (!printSize || !canvas.height || printSize.width <= 0 || printSize.height <= 0) return canvas.width / canvas.dpi;
  let { width: w, height: h } = printSize;
  const portraitCanvas = canvas.height > canvas.width;
  if (w !== h && canvas.width !== canvas.height && h > w !== portraitCanvas) [w, h] = [h, w];
  return Math.min(w, h * (canvas.width / canvas.height));
}

/**
 * Effective print resolution of the visible photo region in this slot: source
 * pixels across the slot over the slot's printed size, on whichever axis has
 * fewer pixels per inch.
 */
export function effectiveDpi(
  region: Rect,
  slot: Pick<PhotoSlot, 'width' | 'widthMm'> & Partial<Pick<PhotoSlot, 'height' | 'heightMm'>>,
  canvas: Pick<TemplateCanvas, 'width' | 'dpi'> & { height?: number },
  printSize?: PrintSizeIn
): number {
  const canvasWidthIn = canvasPrintWidthIn(canvas, printSize);
  const slotWidthIn = slot.widthMm ? slot.widthMm / 25.4 : slot.width * canvasWidthIn;
  if (slotWidthIn <= 0 || region.width <= 0) return 0;
  const byWidth = region.width / slotWidthIn;
  const slotHeightIn = slot.heightMm
    ? slot.heightMm / 25.4
    : slot.height !== undefined && canvas.height
      ? slot.height * canvasWidthIn * (canvas.height / canvas.width)
      : 0;
  if (slotHeightIn <= 0 || region.height <= 0) return byWidth;
  return Math.min(byWidth, region.height / slotHeightIn);
}

/**
 * The pan/zoom that frames a subject (e.g. the people in a cut-out photo) in
 * a slot: the subject's box, with a little room around it, is shown as large
 * as the slot allows, centred. `subject` is a fraction box of the photo as
 * stored (unrotated). The result is clamped like any transform, so the photo
 * still covers the slot.
 */
export function framingForSubject(
  photoWidth: number,
  photoHeight: number,
  slotAspect: number,
  subject: { x: number; y: number; width: number; height: number },
  padding = 0.04
): PhotoTransform {
  const bw = subject.width * photoWidth;
  const bh = subject.height * photoHeight;
  if (!(bw > 0 && bh > 0)) return { ...IDENTITY_TRANSFORM };
  const pad = padding * Math.max(bw, bh);
  const needW = bw + 2 * pad;
  const needH = bh + 2 * pad;
  const width = Math.max(needW, needH * slotAspect);
  const height = width / slotAspect;
  const cx = (subject.x + subject.width / 2) * photoWidth;
  const cy = (subject.y + subject.height / 2) * photoHeight;
  const region = { x: cx - width / 2, y: cy - height / 2, width, height };
  return clampTransform(transformFromVisibleRegion(region, photoWidth, photoHeight, 0, slotAspect), photoWidth, photoHeight, slotAspect);
}
