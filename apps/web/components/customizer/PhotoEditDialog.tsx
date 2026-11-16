'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SCALE, slotAspectRatio, type SlotPhoto } from '@bro-pics/shared';
import { photoToSlotMatrix, traceSlotShape } from './render-template';
import { Icon } from './icons';
import type { TemplateCustomizer } from './use-template-customizer';

interface PhotoEditDialogProps {
  customizer: TemplateCustomizer;
  slotId: string;
  onClose: () => void;
}

/** Room around the photo space, so the customer sees (dimmed) what is cropped away. */
const MARGIN = 0.18;

/**
 * "Edit Image": one photo, big, in its own window. The bright area is what prints in this space; the rest of the
 * photo shows dimmed around it. Drag to move, pinch / wheel / − + to zoom, rotate, fit. Cancel puts the photo back
 * exactly as it was; Save keeps the change. It edits the space's saved photo with the editor's own pan/zoom rules,
 * so what is saved here is exactly what is printed.
 */
export function PhotoEditDialog({ customizer, slotId, onClose }: PhotoEditDialogProps) {
  const { template, state } = customizer;
  const slot = template.photoSlots.find((s) => s.id === slotId);
  const photo = state.slots[slotId];
  const original = useRef<SlotPhoto | undefined>(photo);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const aspect = slot ? slotAspectRatio(slot, template.canvas) : 1;
  const src = photo ? customizer.render.photoSrc(slotId, photo) : null;

  // The photo itself (the same copy the editor draws).
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  // Size the photo space to the window: as big as fits, its own shape kept.
  useEffect(() => {
    const fit = () => {
      const maxW = Math.min(window.innerWidth * 0.92, 720) / (1 + 2 * MARGIN);
      const maxH = (window.innerHeight - 230) / (1 + 2 * MARGIN);
      setBoxW(Math.max(120, Math.floor(Math.min(maxW, maxH * aspect))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [aspect]);

  const boxH = boxW / aspect;
  const m = boxW * MARGIN;
  const cw = Math.round(boxW + 2 * m);
  const ch = Math.round(boxH + 2 * m);

  // Draw: the whole photo, then a dark veil with the photo space cut out of it, then the space's outline.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img || !photo || !slot || !boxW) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = cw * dpr;
    c.height = ch * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const [a, b, cc, d, e, f] = photoToSlotMatrix(photo, aspect, boxW);
    ctx.save();
    ctx.transform(a, b, cc, d, e + m, f + m);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, photo.width, photo.height);
    ctx.restore();
    // The veil on its own layer, with the photo space cut out of it.
    const shape = slot.shape === 'mask' ? { ...slot, shape: 'rect' as const } : slot;
    const veil = document.createElement('canvas');
    veil.width = c.width;
    veil.height = c.height;
    const v = veil.getContext('2d');
    if (v) {
      v.setTransform(dpr, 0, 0, dpr, 0, 0);
      v.fillStyle = 'rgba(20,16,12,0.62)';
      v.fillRect(0, 0, cw, ch);
      v.globalCompositeOperation = 'destination-out';
      traceSlotShape(v, shape, boxW, boxH, m, m);
      v.fill();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(veil, 0, 0);
      ctx.restore();
    }
    ctx.save();
    traceSlotShape(ctx, shape, boxW, boxH, m, m);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }, [img, photo, slot, aspect, boxW, boxH, cw, ch, m]);

  const cancel = () => {
    if (original.current) customizer.restorePhoto(slotId, original.current);
    onClose();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom (non-passive, so the page does not scroll).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      customizer.zoomPhoto(slotId, Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [customizer, slotId]);

  if (!slot || !photo) return null;

  // The design's whole width, at this window's scale (what panPhoto measures a drag against).
  const designW = boxW / slot.width;
  const designH = (designW * template.canvas.height) / template.canvas.width;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = Math.hypot(p.x - q.x, p.y - q.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [p, q] = [...pointers.current.values()];
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      customizer.zoomPhoto(slotId, dist / pinch.current);
      pinch.current = dist;
      return;
    }
    customizer.panPhoto(slotId, e.clientX - prev.x, e.clientY - prev.y, designW, designH);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const scale = photo.transform.scale;
  const tool = 'flex h-11 w-11 items-center justify-center rounded-full text-paper transition-colors hover:bg-paper/15 disabled:opacity-35';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Edit ${slot.label}`} style={{ backgroundColor: 'rgba(24,19,15,0.97)' }} className="fixed inset-0 z-[200] flex flex-col text-paper">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold">Edit {slot.label}</p>
        <p className="hidden text-xs text-paper/60 sm:block">Drag to move · pinch or scroll to zoom</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ width: cw, height: ch, touchAction: 'none' }}
          className="relative cursor-grab select-none active:cursor-grabbing"
        >
          <canvas ref={canvasRef} style={{ width: cw, height: ch }} className="block" aria-label={`${slot.label}: the bright area is what prints`} />
          {!img && <span className="absolute inset-0 flex items-center justify-center text-sm text-paper/70">Loading your photo…</span>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-3">
        <div className="flex items-center gap-1 rounded-full bg-paper/10 px-2 py-1">
          <button type="button" data-shape="circle" aria-label="Zoom out" onClick={() => customizer.zoomPhoto(slotId, 1 / 1.2)} disabled={scale <= 1.001} className={tool}>
            <Icon name="zoomOut" />
          </button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={Math.min(4, scale)}
            onChange={(e) => customizer.setZoom(slotId, Number(e.target.value))}
            aria-label="Zoom"
            className="mx-1 w-28 accent-[#c9861a] sm:w-40"
          />
          <button type="button" data-shape="circle" aria-label="Zoom in" onClick={() => customizer.zoomPhoto(slotId, 1.2)} disabled={scale >= MAX_SCALE - 0.001} className={tool}>
            <Icon name="zoomIn" />
          </button>
          <button type="button" data-shape="circle" aria-label="Rotate 90°" onClick={() => customizer.rotatePhoto(slotId)} className={tool}>
            <Icon name="rotate" />
          </button>
          <button type="button" data-shape="circle" aria-label="Fit to space" onClick={() => customizer.resetPhoto(slotId)} className={tool}>
            <Icon name="fit" />
          </button>
        </div>
        <div className="flex w-full max-w-sm gap-3">
          <button type="button" onClick={cancel} className="h-12 flex-1 rounded-full border border-paper/40 text-sm font-semibold text-paper transition-colors hover:bg-paper/10">
            Cancel
          </button>
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full bg-paper text-sm font-semibold text-ink transition-colors hover:bg-paper/90">
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
