import { clampScale, clampTransform, rotatedSize, slotAspectRatio, type PhotoTransform } from './geometry';
import type { SlotPhoto } from './state';
import type { PersonalizationTemplate, PhotoSlot, Point, TemplateCanvas } from './template-schema';

/**
 * Pointer maths for the editor, kept pure so the browser canvas and tests use
 * the same rules. Everything takes canvas pixels in and returns either a slot
 * id or a clamped PhotoTransform out, so a drag can never expose empty slot area.
 */

export interface SlotBoxPx {
  /** Centre of the slot in canvas pixels. */
  cx: number;
  cy: number;
  /** Unrotated size in canvas pixels. */
  width: number;
  height: number;
  rotationDeg: number;
}

type SlotGeometry = Pick<PhotoSlot, 'x' | 'y' | 'width' | 'height' | 'rotationDeg'>;
type SlotShapeGeometry = SlotGeometry & Pick<PhotoSlot, 'shape' | 'cornerRadius' | 'polygon'>;

export function slotBoxPx(slot: SlotGeometry, canvasWidth: number, canvasHeight: number): SlotBoxPx {
  const width = slot.width * canvasWidth;
  const height = slot.height * canvasHeight;
  return {
    cx: slot.x * canvasWidth + width / 2,
    cy: slot.y * canvasHeight + height / 2,
    width,
    height,
    rotationDeg: slot.rotationDeg ?? 0,
  };
}

function rotate(dx: number, dy: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** A canvas point in the slot's own (unrotated) frame, as fractions of the slot: 0..1 is inside its box. */
export function pointInSlotFrame(slot: SlotGeometry, canvasWidth: number, canvasHeight: number, px: number, py: number): { u: number; v: number } {
  const box = slotBoxPx(slot, canvasWidth, canvasHeight);
  const local = rotate(px - box.cx, py - box.cy, -box.rotationDeg);
  return { u: local.x / box.width + 0.5, v: local.y / box.height + 0.5 };
}

/** Even-odd point-in-polygon test; polygon points and the point share the same units. */
export function pointInPolygon(u: number, v: number, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > v !== b.y > v && u < ((b.x - a.x) * (v - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether a canvas point falls inside a slot's actual shape (rotation and rounded corners/ellipse/polygon included). */
export function slotContainsPoint(slot: SlotShapeGeometry, canvasWidth: number, canvasHeight: number, px: number, py: number): boolean {
  const { u, v } = pointInSlotFrame(slot, canvasWidth, canvasHeight, px, py);
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  switch (slot.shape) {
    case 'ellipse':
      return (u - 0.5) ** 2 / 0.25 + (v - 0.5) ** 2 / 0.25 <= 1;
    case 'polygon':
      return slot.polygon && slot.polygon.length >= 3 ? pointInPolygon(u, v, slot.polygon) : true;
    case 'rounded': {
      const w = slot.width * canvasWidth;
      const h = slot.height * canvasHeight;
      const r = (slot.cornerRadius ?? 0.1) * Math.min(w, h);
      const x = u * w;
      const y = v * h;
      const cx = x < r ? r : x > w - r ? w - r : x;
      const cy = y < r ? r : y > h - r ? h - r : y;
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9;
    }
    default:
      return true;
  }
}

/** The photo slot under a canvas point, honouring paint order (a slot painted later sits on top). */
export function hitTestPhotoSlot(
  template: Pick<PersonalizationTemplate, 'photoSlots' | 'layers'>,
  canvasWidth: number,
  canvasHeight: number,
  px: number,
  py: number
): string | null {
  const byId = new Map(template.photoSlots.map((s) => [s.id, s]));
  const order = template.layers.filter((l) => l.kind === 'photoSlot').map((l) => (l as { slotId: string }).slotId);
  for (let i = order.length - 1; i >= 0; i--) {
    const slot = byId.get(order[i]);
    if (slot && slotContainsPoint(slot, canvasWidth, canvasHeight, px, py)) return slot.id;
  }
  return null;
}

function clampFor(slot: Pick<PhotoSlot, 'width' | 'height'>, canvas: Pick<TemplateCanvas, 'width' | 'height'>, photo: SlotPhoto, transform: PhotoTransform): PhotoTransform {
  const rot = rotatedSize(photo.width, photo.height, photo.rotation);
  return clampTransform(transform, rot.width, rot.height, slotAspectRatio(slot, canvas));
}

/**
 * Turns a drag of (dx, dy) canvas pixels into the slot's new transform. The drag is
 * rotated into the slot's own frame first, so a tilted slot pans the way the finger moves.
 */
export function panTransform(
  slot: SlotGeometry,
  canvas: Pick<TemplateCanvas, 'width' | 'height'>,
  photo: SlotPhoto,
  dxPx: number,
  dyPx: number,
  canvasWidth: number,
  canvasHeight: number
): PhotoTransform {
  const box = slotBoxPx(slot, canvasWidth, canvasHeight);
  const local = rotate(dxPx, dyPx, -box.rotationDeg);
  return clampFor(slot, canvas, photo, {
    scale: photo.transform.scale,
    offsetX: photo.transform.offsetX + local.x / box.width,
    offsetY: photo.transform.offsetY + local.y / box.height,
  });
}

/**
 * Zooms by `factor`, keeping the part of the photo under `focus` (fractions of the
 * slot, default its centre) where it is — so pinching or scrolling over a face zooms
 * into the face rather than the middle of the photo.
 */
export function zoomTransform(
  slot: Pick<PhotoSlot, 'width' | 'height'>,
  canvas: Pick<TemplateCanvas, 'width' | 'height'>,
  photo: SlotPhoto,
  factor: number,
  focus: { u: number; v: number } = { u: 0.5, v: 0.5 }
): PhotoTransform {
  const t = photo.transform;
  const scale = clampScale(t.scale * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  const f = scale / t.scale;
  const fx = focus.u - 0.5;
  const fy = focus.v - 0.5;
  return clampFor(slot, canvas, photo, { scale, offsetX: fx - (fx - t.offsetX) * f, offsetY: fy - (fy - t.offsetY) * f });
}

/** Sets an absolute zoom level (e.g. from a slider), about the slot centre. */
export function zoomTo(slot: Pick<PhotoSlot, 'width' | 'height'>, canvas: Pick<TemplateCanvas, 'width' | 'height'>, photo: SlotPhoto, scale: number): PhotoTransform {
  return zoomTransform(slot, canvas, photo, clampScale(scale) / photo.transform.scale);
}
