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

export type RotationDeg = 0 | 90 | 180 | 270;

/**
 * Given a slot window's size (canvas px) and the current scale/offset/
 * rotation of a photo drawn inside it, returns the rectangle — in the
 * ORIGINAL uploaded image's own pixel space — that ends up visible inside
 * the slot window.
 *
 * Matches Konva's own transform semantics exactly: the photo node is drawn
 * at (x, y) = (slot top-left + offset), scaled uniformly by `scale`, then
 * rotated by `rotationDeg` clockwise ABOUT (x, y) — i.e. rotation is applied
 * after scale, and the anchor point is the node's own (x, y), not the
 * image's center. A point at original-image pixel (u, v) therefore lands
 * at canvas position (relative to the slot's top-left):
 *
 *   0°:    (offsetX + s·u,        offsetY + s·v)
 *   90°:   (offsetX − s·v,        offsetY + s·u)
 *   180°:  (offsetX − s·u,        offsetY − s·v)
 *   270°:  (offsetX + s·v,        offsetY − s·u)
 *
 * (where s = scale; these follow from the standard 2D rotation matrix
 * applied in Konva/canvas's y-down coordinate system, which is what makes
 * a positive-degree rotation appear visually clockwise). Inverting each
 * case for the (u, v) range that lands inside [0, slotWidthPx] x
 * [0, slotHeightPx] gives the crop rect below. At 90°/270° the u-extent is
 * governed by slotHeightPx and the v-extent by slotWidthPx (rather than the
 * matching axis at 0°/180°) — a 90° rotation swaps which slot dimension
 * constrains which original-image dimension.
 *
 * See the fix report for hand-traced example values proving each case.
 */
export function slotCropRectInOriginalPx(
  slotWidthPx: number,
  slotHeightPx: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  rotationDeg: RotationDeg = 0
): Rect {
  switch (rotationDeg) {
    case 0:
      return {
        x: -offsetX / scale,
        y: -offsetY / scale,
        width: slotWidthPx / scale,
        height: slotHeightPx / scale,
      };
    case 90:
      return {
        x: -offsetY / scale,
        y: (offsetX - slotWidthPx) / scale,
        width: slotHeightPx / scale,
        height: slotWidthPx / scale,
      };
    case 180:
      return {
        x: (offsetX - slotWidthPx) / scale,
        y: (offsetY - slotHeightPx) / scale,
        width: slotWidthPx / scale,
        height: slotHeightPx / scale,
      };
    case 270:
      return {
        x: (offsetY - slotHeightPx) / scale,
        y: -offsetX / scale,
        width: slotHeightPx / scale,
        height: slotWidthPx / scale,
      };
  }
}

/**
 * "Cover" scale factor accounting for rotation: at 90°/270° the image's
 * effective footprint against the slot has its width/height swapped
 * relative to the unrotated image, since the image itself is drawn
 * sideways relative to the slot window.
 */
export function coverScaleForRotation(
  slotWidthPx: number,
  slotHeightPx: number,
  imageWidthPx: number,
  imageHeightPx: number,
  rotationDeg: RotationDeg
): number {
  const sideways = rotationDeg === 90 || rotationDeg === 270;
  return sideways
    ? coverScale(slotWidthPx, slotHeightPx, imageHeightPx, imageWidthPx)
    : coverScale(slotWidthPx, slotHeightPx, imageWidthPx, imageHeightPx);
}

/**
 * Offset (relative to the slot's own top-left, matching centeredOffset's
 * convention) that centers an image of imageWidthPx x imageHeightPx, drawn
 * at `scale` and rotated `rotationDeg` clockwise about the node's own
 * (x, y) anchor (Konva's default rotation origin — see
 * slotCropRectInOriginalPx's derivation), within a slotWidthPx x
 * slotHeightPx window.
 *
 * Derived by requiring the rotated+scaled image's canvas-space bounding
 * range on each axis to be centered on the slot's own center
 * (slotWidthPx/2, slotHeightPx/2) — solved per rotation case from the same
 * transform equations slotCropRectInOriginalPx uses.
 */
export function centeredOffsetForRotation(
  slotWidthPx: number,
  slotHeightPx: number,
  imageWidthPx: number,
  imageHeightPx: number,
  scale: number,
  rotationDeg: RotationDeg
): { offsetX: number; offsetY: number } {
  switch (rotationDeg) {
    case 0:
      return centeredOffset(slotWidthPx, slotHeightPx, imageWidthPx, imageHeightPx, scale);
    case 90:
      return {
        offsetX: (slotWidthPx + scale * imageHeightPx) / 2,
        offsetY: (slotHeightPx - scale * imageWidthPx) / 2,
      };
    case 180:
      return {
        offsetX: (slotWidthPx + scale * imageWidthPx) / 2,
        offsetY: (slotHeightPx + scale * imageHeightPx) / 2,
      };
    case 270:
      return {
        offsetX: (slotWidthPx - scale * imageHeightPx) / 2,
        offsetY: (slotHeightPx + scale * imageWidthPx) / 2,
      };
  }
}

/**
 * Adjusts (offsetX, offsetY) so that the point currently at the slot
 * window's own center stays at the slot window's center after the scale
 * changes from oldScale to newScale — i.e. "zoom about center". Derived
 * from canvas = R(θ)·scale·(u,v) + offset: holding canvas position P fixed
 * while scale changes from s0 to s1 gives
 * offset_new = P·(1 − s1/s0) + offset_old·(s1/s0), which — notably — does
 * NOT depend on rotation (R(θ) cancels out when P is held fixed), so this
 * works unchanged regardless of the photo's current rotationDeg.
 */
export function offsetAfterScaleChange(
  offsetX: number,
  offsetY: number,
  oldScale: number,
  newScale: number,
  slotWidthPx: number,
  slotHeightPx: number
): { offsetX: number; offsetY: number } {
  const r = newScale / oldScale;
  const cx = slotWidthPx / 2;
  const cy = slotHeightPx / 2;
  return {
    offsetX: cx * (1 - r) + offsetX * r,
    offsetY: cy * (1 - r) + offsetY * r,
  };
}
