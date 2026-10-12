'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { hitTestPhotoSlot, pointInSlotFrame } from '@bro-pics/shared';
import { renderTemplate } from './render-template';
import { frameFit, frameRing, type FrameLook } from './frame-moulding';
import type { TemplateCustomizer } from './use-template-customizer';

interface TemplateCanvasProps {
  customizer: TemplateCustomizer;
  /** Tapping an empty photo space asks for a photo for it. */
  onRequestPhoto: (slotId: string) => void;
  /** Tallest the canvas may be, in CSS px (keeps a tall design on screen). */
  maxHeight?: number;
  /**
   * Fit the whole design inside the height of the box it sits in (the preview gallery's square), so a tall design
   * is never cut off at the top and bottom. Off where the box grows with its content.
   */
  fitParentHeight?: boolean;
  /**
   * Draw the frame round the design while it is edited (so the first preview keeps its outer frame, as the room
   * pictures do). `printWidthIn` is the design's real width, which sets how thick the moulding looks.
   */
  frame?: { look: FrameLook; printWidthIn: number };
  /** Example pictures for the empty photo spaces (one per space, repeating): shown until the customer adds their own. */
  samples?: string[];
}

const MAX_BACKING_SIDE = 2000;
const TAP_SLOP_PX = 6;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The design, drawn exactly as it will print, with the customer's photos in
 * place. Tap an empty space to add a photo; drag a photo to move it inside its
 * space; pinch (or Ctrl/⌘ + scroll, or a trackpad pinch) to zoom; arrow keys
 * and +/− do the same from the keyboard.
 */
export function TemplateCanvas({ customizer, onRequestPhoto, maxHeight = 640, fitParentHeight = false, frame, samples }: TemplateCanvasProps) {
  const { template, state, activeSlotId, setActiveSlotId, panPhoto, zoomPhoto, render } = customizer;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotCache = useRef(new Map<string, { key: string; canvas: HTMLCanvasElement }>());
  const [cssWidth, setCssWidth] = useState(0);
  const aspect = template.canvas.width / template.canvas.height;

  // The example pictures, loaded once; the canvas is redrawn when they arrive.
  const [sampleImages, setSampleImages] = useState<Array<{ url: string; image: HTMLImageElement }>>([]);
  const sampleKey = (samples ?? []).join('|');
  useEffect(() => {
    const urls = sampleKey ? sampleKey.split('|') : [];
    if (urls.length === 0) {
      setSampleImages([]);
      return;
    }
    let alive = true;
    Promise.all(
      urls.map(
        (url) =>
          new Promise<{ url: string; image: HTMLImageElement } | null>((resolve) => {
            const image = new Image();
            image.onload = () => resolve({ url, image });
            image.onerror = () => resolve(null);
            image.src = url;
          })
      )
    ).then((loaded) => {
      if (alive) setSampleImages(loaded.filter((x): x is { url: string; image: HTMLImageElement } => x !== null));
    });
    return () => {
      alive = false;
    };
  }, [sampleKey]);

  // The frame's thickness as a share of the design's width (0 without a frame).
  const frameShare = frame && frame.printWidthIn > 0 ? Math.min(0.25, frame.look.mouldingWidthIn / frame.printWidthIn) : 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const host = fitParentHeight ? el.parentElement : null;
    const measure = () => {
      let tallest = maxHeight;
      if (host) {
        // The room inside the box (its height without its padding), when it has one.
        const style = getComputedStyle(host);
        const room = host.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
        if (room > 50) tallest = Math.min(maxHeight, room);
      }
      // The design AND its frame have to fit.
      setCssWidth(frameFit({ width: el.clientWidth, height: tallest }, aspect, frameShare).designWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (host) observer.observe(host);
    return () => observer.disconnect();
  }, [aspect, maxHeight, fitParentHeight, frameShare]);

  const mouldingPx = Math.round(cssWidth * frameShare);
  const [ring, setRing] = useState<string | null>(null);
  const lookKey = frame ? `${frame.look.src}|${frame.look.borderPx}` : '';
  useEffect(() => {
    if (!frame || mouldingPx < 1 || cssWidth === 0) {
      setRing(null);
      return;
    }
    let alive = true;
    const scale = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    void frameRing(frame.look, { width: cssWidth, height: cssWidth / aspect }, mouldingPx, scale).then((url) => {
      if (alive) setRing(url);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, cssWidth, aspect, mouldingPx]);

  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const longSide = Math.min(MAX_BACKING_SIDE, Math.round(Math.max(cssWidth, cssWidth / aspect) * dpr));
  const W = Math.max(1, aspect >= 1 ? longSide : Math.round(longSide * aspect));
  const H = Math.max(1, aspect >= 1 ? Math.round(longSide / aspect) : longSide);

  // Draw (once per animation frame) whenever the design, the selection or a loaded image changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth === 0) return;
    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderTemplate(ctx, {
        template,
        state,
        width: W,
        height: H,
        getImage: render.getImage,
        assetSrc: render.assetSrc,
        photoSrc: render.photoSrc,
        photoUnavailable: render.photoUnavailable,
        fontFamily: render.fontFamily,
        mode: 'editor',
        includeUnprinted: true,
        activeSlotId,
        slotCache: slotCache.current,
        sampleFor: sampleImages.length
          ? (slotId) => {
              const index = Math.max(0, template.photoSlots.findIndex((s) => s.id === slotId));
              const pick = sampleImages[index % sampleImages.length]!;
              return { image: pick.image, key: pick.url };
            }
          : undefined,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [template, state, activeSlotId, W, H, cssWidth, render, sampleImages]);

  // --- Pointer gestures ---------------------------------------------------

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ slotId: string | null; mode: 'pan' | 'pinch'; moved: boolean; downAt: { x: number; y: number }; lastDist: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Client coordinates → pixels of the W×H design canvas (independent of devicePixelRatio). */
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) * W) / rect.width, y: ((clientY - rect.top) * H) / rect.height, scale: W / rect.width };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toCanvas(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      const slotId = hitTestPhotoSlot(template, W, H, p.x, p.y);
      gesture.current = { slotId, mode: 'pan', moved: false, downAt: p, lastDist: 0 };
      if (slotId) setActiveSlotId(slotId);
    } else if (pointers.current.size === 2 && gesture.current?.slotId) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.mode = 'pinch';
      gesture.current.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = toCanvas(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g?.slotId || !stateRef.current.slots[g.slotId]) return;
    if (g.mode === 'pan' && pointers.current.size === 1) {
      if (!g.moved && Math.hypot(p.x - g.downAt.x, p.y - g.downAt.y) < TAP_SLOP_PX * p.scale) return;
      g.moved = true;
      panPhoto(g.slotId, p.x - prev.x, p.y - prev.y, W, H);
    } else if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.lastDist > 0 && dist > 0) {
        const slot = template.photoSlots.find((s) => s.id === g.slotId)!;
        const focus = pointInSlotFrame(slot, W, H, (a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomPhoto(g.slotId, dist / g.lastDist, { u: clamp01(focus.u), v: clamp01(focus.v) });
      }
      g.lastDist = dist;
      g.moved = true;
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size === 0) {
      if (e.type === 'pointerup' && g && !g.moved && g.slotId && !stateRef.current.slots[g.slotId]) onRequestPhoto(g.slotId);
      gesture.current = null;
    } else if (g) {
      g.mode = 'pan';
    }
  };

  // Ctrl/⌘ + wheel (also what a trackpad pinch sends) zooms the photo under the
  // pointer; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const p = toCanvas(e.clientX, e.clientY);
      const slotId = hitTestPhotoSlot(template, W, H, p.x, p.y);
      if (!slotId || !stateRef.current.slots[slotId]) return;
      e.preventDefault();
      setActiveSlotId(slotId);
      const slot = template.photoSlots.find((s) => s.id === slotId)!;
      const focus = pointInSlotFrame(slot, W, H, p.x, p.y);
      zoomPhoto(slotId, Math.exp(-e.deltaY * 0.0025), { u: clamp01(focus.u), v: clamp01(focus.v) });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, W, H, zoomPhoto, setActiveSlotId]);

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!activeSlotId || !state.slots[activeSlotId]) {
      if ((e.key === 'Enter' || e.key === ' ') && activeSlotId) {
        e.preventDefault();
        onRequestPhoto(activeSlotId);
      }
      return;
    }
    const step = (e.shiftKey ? 0.05 : 0.01) * W;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      panPhoto(activeSlotId, moves[e.key][0], moves[e.key][1], W, H);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomPhoto(activeSlotId, 1.1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomPhoto(activeSlotId, 1 / 1.1);
    }
  };

  const activeHasPhoto = Boolean(activeSlotId && state.slots[activeSlotId]);
  const activeLabel = template.photoSlots.find((s) => s.id === activeSlotId)?.label;

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div
        data-testid="canvas-frame"
        style={ring ? { padding: mouldingPx, backgroundImage: `url(${ring})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', filter: 'drop-shadow(0 14px 22px rgba(43,36,32,0.35))' } : undefined}
      >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        tabIndex={0}
        role="img"
        aria-label={`Your design. ${activeLabel ? `Selected: ${activeLabel}. ` : ''}${
          activeHasPhoto ? 'Drag or use the arrow keys to move the photo, plus and minus to zoom.' : 'Press Enter to add a photo.'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className={`block outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${ring ? '' : 'rounded-lg shadow-[0_18px_40px_-18px_rgba(43,36,32,0.45)]'}`}
        style={{
          width: cssWidth || '100%',
          height: cssWidth ? cssWidth / aspect : undefined,
          aspectRatio: cssWidth ? undefined : `${template.canvas.width} / ${template.canvas.height}`,
          // Once a photo is selected, a drag moves it instead of scrolling the page.
          touchAction: activeHasPhoto ? 'none' : 'pan-y pinch-zoom',
          cursor: activeHasPhoto ? 'grab' : 'pointer',
        }}
      />
      </div>
    </div>
  );
}
