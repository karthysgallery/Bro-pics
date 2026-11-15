'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface ZoomPaneProps {
  children: ReactNode;
  /** Changing it (a different picture) zooms back out. */
  resetKey?: string | number;
  /** A horizontal swipe while not zoomed in: -1 for the previous picture, +1 for the next. */
  onSwipe?: (dir: -1 | 1) => void;
  className?: string;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const START: View = { scale: 1, x: 0, y: 0 };

/**
 * A picture you can look into: pinch or mouse-wheel to zoom, drag to move around while zoomed,
 * double-tap (or double-click) to jump in and out, and + / − / reset buttons for anyone without
 * a wheel or two fingers. Not zoomed in, a sideways swipe calls `onSwipe` so a gallery can step on.
 */
export function ZoomPane({ children, resetKey, onSwipe, className = '' }: ZoomPaneProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(START);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; start: { x: number; y: number }; moved: boolean } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => setView(START), [resetKey]);

  /** Keeps the picture covering the box: it can't be dragged off past its own edges. */
  const clamp = useCallback((v: View): View => {
    const box = boxRef.current;
    if (!box || v.scale <= 1) return START;
    const maxX = ((v.scale - 1) * box.clientWidth) / 2;
    const maxY = ((v.scale - 1) * box.clientHeight) / 2;
    return { scale: v.scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
  }, []);

  /** Zooms to `scale`, keeping the point under (clientX, clientY) where it is. */
  const zoomAt = useCallback(
    (scale: number, clientX?: number, clientY?: number) => {
      const box = boxRef.current;
      if (!box) return;
      const v = viewRef.current;
      const next = Math.max(1, Math.min(MAX_SCALE, scale));
      const rect = box.getBoundingClientRect();
      const cx = clientX === undefined ? 0 : clientX - rect.left - rect.width / 2;
      const cy = clientY === undefined ? 0 : clientY - rect.top - rect.height / 2;
      const k = next / v.scale;
      setView(clamp({ scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }));
    },
    [clamp]
  );

  // The wheel listener has to be non-passive to stop the page scrolling while zooming.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    };
    box.addEventListener('wheel', wheel, { passive: false });
    return () => box.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    boxRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      dist: pts.length === 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0,
      start: { x: e.clientX, y: e.clientY },
      moved: pts.length > 1,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (g.dist > 0) zoomAt(viewRef.current.scale * (dist / g.dist), (pts[0]!.x + pts[1]!.x) / 2, (pts[0]!.y + pts[1]!.y) / 2);
      g.dist = dist;
      g.moved = true;
      return;
    }
    if (g && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 6) g.moved = true;
    if (viewRef.current.scale > 1) {
      const v = viewRef.current;
      setView(clamp({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const wasPinch = pointers.current.size > 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || wasPinch) return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    // A sideways swipe, not zoomed in, moves to the next picture.
    if (viewRef.current.scale <= 1 && onSwipe && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      onSwipe(dx < 0 ? 1 : -1);
      return;
    }
    if (g.moved) return;
    // Double-tap / double-click: in to the spot, or back out.
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (viewRef.current.scale > 1) setView(START);
      else zoomAt(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
    } else lastTap.current = now;
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  const zoomed = view.scale > 1.001;
  const control =
    'flex h-10 w-10 items-center justify-center rounded-full text-paper transition-colors hover:bg-paper/15 disabled:opacity-35 disabled:hover:bg-transparent';

  return (
    <div
      ref={boxRef}
      data-testid="zoom-pane"
      data-zoom={view.scale.toFixed(2)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(e) => {
        if (e.key === '+' || e.key === '=') zoomAt(view.scale * 1.5);
        else if (e.key === '-') zoomAt(view.scale / 1.5);
        else if (e.key === '0') setView(START);
      }}
      style={{ touchAction: 'none' }}
      className={`relative select-none overflow-hidden ${zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} ${className}`}
    >
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          transition: pointers.current.size > 0 ? 'none' : 'transform 160ms ease-out',
        }}
      >
        {children}
      </div>

      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-ink/75 px-1 py-1 shadow-lg backdrop-blur-sm">
        <button type="button" data-shape="circle" aria-label="Zoom out" onClick={() => zoomAt(view.scale / 1.5)} disabled={!zoomed} className={control}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <span className="w-12 text-center text-xs font-semibold tabular-nums text-paper/85" aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <button type="button" data-shape="circle" aria-label="Zoom in" onClick={() => zoomAt(view.scale * 1.5)} disabled={view.scale >= MAX_SCALE - 0.001} className={control}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" data-shape="circle" aria-label="Reset zoom" onClick={() => setView(START)} disabled={!zoomed} className={control}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
        </button>
      </div>
    </div>
  );
}
