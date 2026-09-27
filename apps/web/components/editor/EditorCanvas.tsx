'use client';

import { useEffect, useRef, useState } from 'react';
import { PAPER, ALERT } from '../../lib/design-tokens';
import { fractionRectToCanvasRect, EDITOR_CANVAS_SIZE, type Rect as GeometryRect, type RotationDeg } from '@bro-pics/shared';

const CANVAS_SIZE = EDITOR_CANVAS_SIZE;

export interface SlotDrawState {
  slotIndex: number;
  rect: GeometryRect;
  maskUrl?: string | null;
  photoUrl: string | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: RotationDeg;
}

export interface CanvasTextField {
  key: string;
  value: string;
  color: string;
  fontFamily: string;
  zoneRect: GeometryRect;
  align: 'left' | 'center' | 'right';
  // [FE-12] FrameTemplate.textZones[].minFontSizePx/maxFontSizePx — canvas
  // px (this component's own unit, same as CANVAS_SIZE), clamping the
  // auto-fit loop below. Absent means the pre-existing unclamped 8-32px
  // auto-fit range.
  minFontSizePx?: number;
  maxFontSizePx?: number;
}

export interface CanvasClipart {
  assetUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorCanvasProps {
  mockupUrl: string;
  // Drawn once, after the mockup, before text/clipart — lets a template add
  // a decorative element (glass glare, embossed border) on top of the
  // composited photo without it being cropped by any slot mask.
  overlayUrl?: string | null;
  // Every filled slot draws simultaneously (a real live preview, not just
  // whichever slot happens to be "active") — only `activeSlotIndex`'s rect
  // gets pointer-drag handlers.
  slots: SlotDrawState[];
  activeSlotIndex: number;
  textFields?: CanvasTextField[];
  clipart?: CanvasClipart | null;
  onTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => void;
  // [FE-08] A two-finger pinch reports a per-move scale FACTOR (current
  // distance / distance at the last reported move), not an absolute
  // scale — the same shape the existing zoom buttons' onZoomStep already
  // uses, so both go through the parent's one clamped scale calculation
  // (coverScaleForRotation..MAX_ZOOM_MULTIPLE) instead of this component
  // computing and potentially exceeding those bounds itself.
  onPinchZoom?: (factor: number) => void;
  // A two-finger twist past the rotate threshold — rotationDeg only ever
  // takes the four 90° values (packages/shared/src/editor-geometry.ts),
  // so this reuses the existing discrete rotate action rather than
  // introducing continuous rotation the rest of the geometry model can't
  // represent.
  onPinchRotate?: () => void;
  // Fires with a fresh canvas.toDataURL() PNG data URL of the WHOLE
  // composed canvas (mockup + every slot + overlay + text + clipart)
  // whenever it changes — one shared preview for the entire
  // personalization rather than one capture per slot, since every slot now
  // renders onto the same persistent canvas at once.
  onCanvasUpdate?: (dataUrl: string | null) => void;
}

/**
 * Loads an <img> for `src`, retrying without `crossOrigin: 'anonymous'` if
 * the anonymous load fails — a signed GCS URL needs `crossOrigin: 'anonymous'`
 * to avoid tainting the canvas (which would break the preview-export
 * toDataURL() call), but if the bucket's CORS isn't configured for it, the
 * ANONYMOUS load fails outright rather than just tainting — worse than a
 * tainted canvas, since the customer would see an empty slot. So: try
 * anonymous first, and only fall back to a plain (taint-accepting) load if
 * that fails.
 */
function useHtmlImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let cancelled = false;

    const anonymousImg = new Image();
    anonymousImg.crossOrigin = 'anonymous';
    anonymousImg.onload = () => {
      if (!cancelled) setImage(anonymousImg);
    };
    anonymousImg.onerror = () => {
      if (cancelled) return;
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        if (!cancelled) setImage(fallbackImg);
      };
      fallbackImg.onerror = () => {
        if (!cancelled) setImage(null);
      };
      fallbackImg.src = src;
    };
    anonymousImg.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

// A handful of images across all slots + mockup + overlay + clipart — a
// small fixed-size cache keyed by URL is simpler and cheaper than a hook
// per possible image, and means switching slots doesn't reload an image
// that's already loaded.
function useImageCache(urls: (string | null | undefined)[]): { cache: Map<string, HTMLImageElement>; version: number } {
  // `version` is the piece that actually belongs in a consuming effect's
  // dependency array — `cacheRef.current` is the same Map instance on every
  // render (mutated in place), so a dependency array that lists the Map
  // itself never sees it as "changed" once an image finishes loading async,
  // and the draw effect would silently skip repainting the newly loaded photo.
  const [version, setVersion] = useState(0);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const key = urls.filter(Boolean).join('|');

  useEffect(() => {
    let cancelled = false;
    const wanted = urls.filter((u): u is string => !!u);
    for (const url of wanted) {
      if (cacheRef.current.has(url)) continue;
      const anonymousImg = new Image();
      anonymousImg.crossOrigin = 'anonymous';
      anonymousImg.onload = () => {
        if (cancelled) return;
        cacheRef.current.set(url, anonymousImg);
        setVersion((n) => n + 1);
      };
      anonymousImg.onerror = () => {
        if (cancelled) return;
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          if (cancelled) return;
          cacheRef.current.set(url, fallbackImg);
          setVersion((n) => n + 1);
        };
        fallbackImg.src = url;
      };
      anonymousImg.src = url;
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { cache: cacheRef.current, version };
}

function drawTextField(ctx: CanvasRenderingContext2D, field: CanvasTextField) {
  if (!field.value) return;
  const zoneRect = fractionRectToCanvasRect(field.zoneRect, CANVAS_SIZE, CANVAS_SIZE);

  // Auto-shrink: step the font size down until the text fits both the
  // zone's width and its height, rather than squishing glyphs with
  // fillText's maxWidth argument (which distorts rather than resizes).
  // [FE-12] minFontSizePx/maxFontSizePx (when set) narrow this range —
  // a template author's chosen bounds always win over the auto-fit
  // default, even if that means text overflowing the zone at the floor
  // rather than shrinking below the template's own minimum.
  const floor = Math.max(8, field.minFontSizePx ?? 8);
  const ceiling = Math.max(floor, Math.min(field.maxFontSizePx ?? 32, 32));
  let fontSize = Math.max(floor, Math.min(ceiling, zoneRect.height));
  ctx.save();
  ctx.fillStyle = field.color;
  ctx.textBaseline = 'middle';
  for (; fontSize > floor; fontSize -= 1) {
    ctx.font = `${fontSize}px ${field.fontFamily}`;
    const width = ctx.measureText(field.value).width;
    if (width <= zoneRect.width && fontSize <= zoneRect.height) break;
  }
  ctx.font = `${fontSize}px ${field.fontFamily}`;

  let x: number;
  if (field.align === 'left') {
    ctx.textAlign = 'left';
    x = zoneRect.x;
  } else if (field.align === 'right') {
    ctx.textAlign = 'right';
    x = zoneRect.x + zoneRect.width;
  } else {
    ctx.textAlign = 'center';
    x = zoneRect.x + zoneRect.width / 2;
  }
  ctx.fillText(field.value, x, zoneRect.y + zoneRect.height / 2);
  ctx.restore();
}

/**
 * Draws one slot's photo, masked or clipped to its rect. With a `maskUrl`,
 * the photo is composited on an offscreen canvas sized to the slot rect
 * (so the mask image — which is authored at the slot's own aspect ratio —
 * lines up 1:1), then blitted onto the main canvas with no further
 * clipping (the mask has already done the cropping). Without a `maskUrl`,
 * falls back to the original plain-rectangle `ctx.clip()` — zero risk to
 * existing templates that don't specify one.
 */
function drawSlotPhoto(
  ctx: CanvasRenderingContext2D,
  slot: SlotDrawState,
  canvasRect: GeometryRect,
  photoImage: HTMLImageElement | null,
  maskImage: HTMLImageElement | null
) {
  if (!photoImage) return;

  if (slot.maskUrl && maskImage) {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasRect.width;
    offscreen.height = canvasRect.height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    offCtx.save();
    offCtx.translate(slot.offsetX, slot.offsetY);
    offCtx.rotate((slot.rotationDeg * Math.PI) / 180);
    offCtx.scale(slot.scale, slot.scale);
    offCtx.drawImage(photoImage, 0, 0);
    offCtx.restore();

    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.drawImage(maskImage, 0, 0, canvasRect.width, canvasRect.height);

    ctx.drawImage(offscreen, canvasRect.x, canvasRect.y);
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);
  ctx.clip();
  ctx.translate(canvasRect.x + slot.offsetX, canvasRect.y + slot.offsetY);
  ctx.rotate((slot.rotationDeg * Math.PI) / 180);
  ctx.scale(slot.scale, slot.scale);
  ctx.drawImage(photoImage, 0, 0);
  ctx.restore();
}

type CanvasPoint = { x: number; y: number };

// [FE-08] Pure so the pinch/rotate math is unit-testable without mounting
// a real <canvas> (jsdom has no 2D context) or simulating touch events.
export function distanceBetween(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleBetweenDeg(a: CanvasPoint, b: CanvasPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// Signed shortest angular distance, e.g. 350deg -> 10deg is +20, not -340.
export function normalizeAngleDeltaDeg(deltaDeg: number): number {
  let d = deltaDeg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// A full 90deg swing shouldn't need a full 90deg of finger movement to
// register — this is a per-registered-step threshold (see handlePointerMove
// below, which re-bases startAngleDeg after each trigger), not a
// cumulative-gesture one, so a continued twist keeps stepping every
// ROTATE_STEP_THRESHOLD_DEG rather than firing once and going silent.
export const ROTATE_STEP_THRESHOLD_DEG = 30;

export function EditorCanvas({
  mockupUrl,
  overlayUrl,
  slots,
  activeSlotIndex,
  textFields,
  clipart,
  onTransformChange,
  onCanvasUpdate,
  onPinchZoom,
  onPinchRotate,
}: EditorCanvasProps) {
  const mockupImage = useHtmlImage(mockupUrl);
  const overlayImage = useHtmlImage(overlayUrl);
  const clipartImage = useHtmlImage(clipart?.assetUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const photoUrls = slots.map((s) => s.photoUrl);
  const maskUrls = slots.map((s) => s.maskUrl);
  const { cache: imageCache, version: imageCacheVersion } = useImageCache([...photoUrls, ...maskUrls]);

  // Cheap, defensive — closes any remaining FOUT gap even though
  // next/font's self-hosting already makes it unlikely, so the very first
  // paint doesn't measure/draw text against a fallback font metric.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) {
      setFontsReady(true);
      return;
    }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live drag state — kept in a ref (not React state) so pointermove can
  // read/update it synchronously every frame without waiting on a render.
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  // [FE-08] Every currently-down pointer, canvas-space. A single entry is
  // an ordinary one-finger drag (dragRef, below); two entries switch to
  // pinch-zoom/two-finger-rotate — the two concerns are mutually
  // exclusive per gesture, never blended into one transform.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDistance: number; startAngleDeg: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activeSlot = slots.find((s) => s.slotIndex === activeSlotIndex);
  const activeCanvasRect = activeSlot ? fractionRectToCanvasRect(activeSlot.rect, CANVAS_SIZE, CANVAS_SIZE) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Photo layer: every filled slot draws simultaneously, clipped/masked
    // to its own rect. Transform order (translate slot-relative offset,
    // rotate, scale, then draw the image at its own local origin) MUST
    // stay in lockstep with the crop-rect math in
    // @bro-pics/shared's editor-geometry.ts, which was derived from this
    // exact transform order.
    for (const slot of slots) {
      const canvasRect = fractionRectToCanvasRect(slot.rect, CANVAS_SIZE, CANVAS_SIZE);
      const photoImage = slot.photoUrl ? (imageCache.get(slot.photoUrl) ?? null) : null;
      const maskImage = slot.maskUrl ? (imageCache.get(slot.maskUrl) ?? null) : null;
      drawSlotPhoto(ctx, slot, canvasRect, photoImage, maskImage);

      // Slot outline only for the active slot — with several filled slots
      // visible at once, outlining all of them reads as visual clutter.
      if (slot.slotIndex === activeSlotIndex) {
        ctx.strokeStyle = ALERT;
        ctx.lineWidth = 2;
        ctx.strokeRect(canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);
      }
    }

    if (mockupImage) {
      ctx.drawImage(mockupImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    if (overlayImage) {
      ctx.drawImage(overlayImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    if (fontsReady && textFields) {
      for (const field of textFields) {
        drawTextField(ctx, field);
      }
    }

    if (clipart && clipartImage) {
      const rect = fractionRectToCanvasRect(clipart, CANVAS_SIZE, CANVAS_SIZE);
      ctx.drawImage(clipartImage, rect.x, rect.y, rect.width, rect.height);
    }

    if (onCanvasUpdate) {
      const hasAnyPhoto = slots.some((s) => s.photoUrl);
      if (!hasAnyPhoto) {
        onCanvasUpdate(null);
      } else {
        try {
          onCanvasUpdate(canvas.toDataURL());
        } catch {
          // Canvas-taint SecurityError (missing/misconfigured Storage
          // CORS) or any other export failure — "no preview available".
          onCanvasUpdate(null);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mockupImage,
    overlayImage,
    clipartImage,
    fontsReady,
    imageCacheVersion,
    activeSlotIndex,
    JSON.stringify(slots),
    JSON.stringify(textFields),
    JSON.stringify(clipart),
  ]);

  const canvasPointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const pointInActiveRect = (point: { x: number; y: number }) => {
    if (!activeCanvasRect) return false;
    return (
      point.x >= activeCanvasRect.x &&
      point.x <= activeCanvasRect.x + activeCanvasRect.width &&
      point.y >= activeCanvasRect.y &&
      point.y <= activeCanvasRect.y + activeCanvasRect.height
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeSlot?.photoUrl) return;
    const point = canvasPointFromEvent(event);
    // The FIRST finger must land on the photo (unchanged single-finger
    // intent) — a second finger completing a pinch can land anywhere on
    // the canvas, matching how every native pinch-zoom gesture works.
    if (pointersRef.current.size === 0 && !pointInActiveRect(point)) return;

    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 1) {
      dragRef.current = { startX: point.x, startY: point.y, startOffsetX: activeSlot.offsetX, startOffsetY: activeSlot.offsetY };
      setIsDragging(true);
      return;
    }

    if (pointersRef.current.size === 2) {
      // A second finger arriving mid-drag ends the drag outright — the two
      // gestures never blend into one transform.
      dragRef.current = null;
      setIsDragging(false);
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = { startDistance: distanceBetween(p1, p2), startAngleDeg: angleBetweenDeg(p1, p2) };
    }
    // A third+ pointer is tracked (so releasing it doesn't wrongly end the
    // pinch) but never changes which two points drive the gesture.
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, canvasPointFromEvent(event));
    }

    if (pinchRef.current && pointersRef.current.size >= 2 && activeSlot) {
      const [p1, p2] = [...pointersRef.current.values()];
      const distance = distanceBetween(p1, p2);
      const angleDeg = angleBetweenDeg(p1, p2);
      const pinch = pinchRef.current;

      if (pinch.startDistance > 0 && onPinchZoom) {
        onPinchZoom(distance / pinch.startDistance);
      }
      pinch.startDistance = distance;

      const angleDelta = normalizeAngleDeltaDeg(angleDeg - pinch.startAngleDeg);
      if (Math.abs(angleDelta) >= ROTATE_STEP_THRESHOLD_DEG) {
        onPinchRotate?.();
        pinch.startAngleDeg = angleDeg;
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || !activeSlot) return;
    const point = canvasPointFromEvent(event);
    onTransformChange(activeSlot.slotIndex, {
      scale: activeSlot.scale,
      offsetX: drag.startOffsetX + (point.x - drag.startX),
      offsetY: drag.startOffsetY + (point.y - drag.startY),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (dragRef.current) {
      dragRef.current = null;
      setIsDragging(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="rounded-xl overflow-hidden"
      style={{
        touchAction: 'none',
        cursor: activeSlot?.photoUrl ? (isDragging ? 'grabbing' : 'grab') : 'default',
        width: '100%',
        maxWidth: 560,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
