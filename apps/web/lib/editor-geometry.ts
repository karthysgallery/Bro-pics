export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Side length (px) of the square Konva Stage the editor renders into. Shared so
 * every consumer that needs to convert between fraction-rects, canvas-pixel
 * rects, and original-image-pixel rects agrees on the same canvas size. */
export const EDITOR_CANVAS_SIZE = 400;

/**
 * Converts a FrameTemplate.printableRects entry (fractions of the mockup
 * image's own width/height, 0-1) into canvas-pixel coordinates for a
 * canvas rendered at canvasWidthPx x canvasHeightPx.
 */
export function fractionRectToCanvasRect(rect: Rect, canvasWidthPx: number, canvasHeightPx: number): Rect {
  return {
    x: Math.round(rect.x * canvasWidthPx),
    y: Math.round(rect.y * canvasHeightPx),
    width: Math.round(rect.width * canvasWidthPx),
    height: Math.round(rect.height * canvasHeightPx),
  };
}

/**
 * "Cover" scale factor for drawing an image of imageWidthPx x imageHeightPx
 * (natural pixel size) so it fully covers a slotWidthPx x slotHeightPx
 * window — the larger of the two axis ratios wins, so the image overflows
 * (and gets clipped by) the shorter axis rather than leaving gaps.
 */
export function coverScale(
  slotWidthPx: number,
  slotHeightPx: number,
  imageWidthPx: number,
  imageHeightPx: number
): number {
  return Math.max(slotWidthPx / imageWidthPx, slotHeightPx / imageHeightPx);
}

/**
 * Offset (in canvas px, relative to the slot's own top-left corner) that
 * centers an image of imageWidthPx x imageHeightPx, drawn at the given
 * scale, within a slotWidthPx x slotHeightPx window. With a cover scale
 * this is typically negative on the axis that overflows the slot.
 */
export function centeredOffset(
  slotWidthPx: number,
  slotHeightPx: number,
  imageWidthPx: number,
  imageHeightPx: number,
  scale: number
): { offsetX: number; offsetY: number } {
  return {
    offsetX: (slotWidthPx - imageWidthPx * scale) / 2,
    offsetY: (slotHeightPx - imageHeightPx * scale) / 2,
  };
}

/**
 * Given a slot window's size (canvas px) and the current scale/offset of a
 * photo drawn inside it (photo top-left = slot top-left + offset, drawn at
 * `scale`), returns the rectangle — in the ORIGINAL uploaded image's own
 * pixel space — that ends up visible inside the slot window.
 *
 * Derivation: a point at original-image pixel (u, v) is drawn at canvas
 * position (offset + u * scale) relative to the slot's top-left. Solving
 * for the original-pixel coordinates that land on the slot's edges:
 *   u = (canvasX - offset) / scale
 * so the slot's left edge (canvasX = 0 relative to slot) maps to
 * u = -offsetX / scale, and the slot's right edge (canvasX = slotWidthPx)
 * maps to u = (slotWidthPx - offsetX) / scale. The width of that range is
 * slotWidthPx / scale regardless of offset (offset only shifts position,
 * not extent) — same for height.
 */
export function slotCropRectInOriginalPx(
  slotWidthPx: number,
  slotHeightPx: number,
  scale: number,
  offsetX: number,
  offsetY: number
): Rect {
  return {
    x: -offsetX / scale,
    y: -offsetY / scale,
    width: slotWidthPx / scale,
    height: slotHeightPx / scale,
  };
}
