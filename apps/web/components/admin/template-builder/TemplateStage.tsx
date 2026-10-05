'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PersonalizationState, PersonalizationTemplate, PhotoSlot, SlotPhoto } from '@bro-pics/shared';
import { renderTemplate, requiredImageSources } from '../../customizer/render-template';
import { templateAssetSrc } from '../../customizer/asset-src';
import { useImageCache } from '../../customizer/image-cache';
import { resolveFontFamilyForCanvas } from '../../../lib/text-personalization-options';
import type { SlotPatch } from './template-draft';

export interface SamplePhoto {
  src: string;
  width: number;
  height: number;
}

interface TemplateStageProps {
  template: PersonalizationTemplate;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange?: (kind: 'photo' | 'text', id: string, patch: SlotPatch) => void;
  /** Photos to show in the spaces, by slot id (the admin's own files, never uploaded). */
  samples?: ReadonlyMap<string, SamplePhoto>;
  /** Sample text, by text slot id. */
  sampleTexts?: Readonly<Record<string, string>>;
  readOnly?: boolean;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

function shapePath(slot: Pick<PhotoSlot, 'shape' | 'cornerRadius' | 'polygon'>, x: number, y: number, w: number, h: number): string {
  if (slot.shape === 'ellipse') {
    return `M${x + w / 2},${y} a${w / 2},${h / 2} 0 1,0 0.01,0 Z`;
  }
  if (slot.shape === 'polygon' && slot.polygon && slot.polygon.length >= 3) {
    return slot.polygon.map((p, i) => `${i ? 'L' : 'M'}${x + p.x * w},${y + p.y * h}`).join(' ') + ' Z';
  }
  const r = slot.shape === 'rounded' ? Math.min((slot.cornerRadius ?? 0.1) * Math.min(w, h), w / 2, h / 2) : 0;
  if (!r) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} Z`;
}

/**
 * The template as customers will see it (drawn by the same renderer as the
 * shop and the print), with every photo and text space outlined on top. Drag a
 * space to move it, drag a corner to resize, arrow keys to nudge.
 */
export function TemplateStage({ template, selectedId, onSelect, onChange, samples, sampleTexts, readOnly = false }: TemplateStageProps) {
  const W = template.canvas.width;
  const H = template.canvas.height;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const slotCache = useRef(new Map<string, { key: string; canvas: HTMLCanvasElement }>());
  const [renderWidth, setRenderWidth] = useState(0);

  const state: PersonalizationState = useMemo(() => {
    const slots: Record<string, SlotPhoto> = {};
    for (const slot of template.photoSlots) {
      const sample = samples?.get(slot.id);
      if (sample) slots[slot.id] = { assetId: `sample:${slot.id}`, width: sample.width, height: sample.height, transform: { scale: 1, offsetX: 0, offsetY: 0 }, rotation: 0, confirmedLowDpi: false };
    }
    const texts = Object.fromEntries(Object.entries(sampleTexts ?? {}).map(([id, value]) => [id, { value }]));
    return { schemaVersion: 1, templateId: template.id, templateVersion: template.version, slots, texts };
  }, [template, samples, sampleTexts]);

  const photoSrc = (slotId: string) => samples?.get(slotId)?.src ?? null;
  const assetSrc = templateAssetSrc;
  const { srcs } = requiredImageSources({ template, state, assetSrc, photoSrc, includeUnprinted: true });
  const images = useImageCache(srcs);

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const measure = () => setRenderWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, (Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) * Math.max(1, renderWidth)) / W);
  const cw = Math.max(1, Math.round(W * scale));
  const ch = Math.max(1, Math.round(H * scale));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || renderWidth === 0) return;
    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderTemplate(ctx, {
        template,
        state,
        width: cw,
        height: ch,
        getImage: images.get,
        assetSrc,
        photoSrc: (slotId) => photoSrc(slotId),
        fontFamily: resolveFontFamilyForCanvas,
        mode: 'editor',
        includeUnprinted: true,
        slotCache: slotCache.current,
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, state, cw, ch, images.version, renderWidth]);

  // --- Direct manipulation --------------------------------------------------

  const drag = useRef<{ kind: 'photo' | 'text'; id: string; mode: 'move' | Corner; start: { x: number; y: number }; box: { x: number; y: number; width: number; height: number } } | null>(null);

  const toFraction = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const begin = (e: ReactPointerEvent, kind: 'photo' | 'text', id: string, mode: 'move' | Corner) => {
    e.stopPropagation();
    onSelect(id);
    if (readOnly || !onChange) return;
    const slot = kind === 'photo' ? template.photoSlots.find((s) => s.id === id) : template.textSlots.find((s) => s.id === id);
    if (!slot) return;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { kind, id, mode, start: toFraction(e.clientX, e.clientY), box: { x: slot.x, y: slot.y, width: slot.width, height: slot.height } };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !onChange) return;
    const p = toFraction(e.clientX, e.clientY);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const b = d.box;
    const patch: SlotPatch =
      d.mode === 'move'
        ? { x: b.x + dx, y: b.y + dy }
        : d.mode === 'se'
          ? { width: b.width + dx, height: b.height + dy }
          : d.mode === 'nw'
            ? { x: b.x + dx, y: b.y + dy, width: b.width - dx, height: b.height - dy }
            : d.mode === 'ne'
              ? { y: b.y + dy, width: b.width + dx, height: b.height - dy }
              : { x: b.x + dx, width: b.width - dx, height: b.height + dy };
    onChange(d.kind, d.id, patch);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!selectedId || readOnly || !onChange) return;
    const step = e.shiftKey ? 0.01 : 0.002;
    const kind = template.photoSlots.some((s) => s.id === selectedId) ? 'photo' : 'text';
    const slot = kind === 'photo' ? template.photoSlots.find((s) => s.id === selectedId) : template.textSlots.find((s) => s.id === selectedId);
    if (!slot) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onChange(kind, selectedId, { x: slot.x + m[0], y: slot.y + m[1] });
  };

  const handle = Math.max(W, H) * 0.012;
  const stroke = Math.max(W, H) * 0.0025;

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} width={cw} height={ch} className="absolute inset-0 h-full w-full rounded-lg shadow-[0_12px_32px_-16px_rgba(43,36,32,0.5)]" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-gold"
        tabIndex={0}
        role="application"
        aria-label="Template layout. Select a space, then drag it, drag a corner to resize, or use the arrow keys."
        onPointerDown={() => onSelect(null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        {template.photoSlots.map((slot, i) => {
          const x = slot.x * W;
          const y = slot.y * H;
          const w = slot.width * W;
          const h = slot.height * H;
          const selected = slot.id === selectedId;
          return (
            <g key={slot.id} transform={slot.rotationDeg ? `rotate(${slot.rotationDeg} ${x + w / 2} ${y + h / 2})` : undefined}>
              <path
                d={shapePath(slot, x, y, w, h)}
                fill={selected ? 'rgba(201,134,26,0.16)' : 'rgba(255,255,255,0.001)'}
                stroke={selected ? '#c9861a' : 'rgba(43,36,32,0.55)'}
                strokeWidth={selected ? stroke * 1.6 : stroke}
                strokeDasharray={selected ? undefined : `${stroke * 4} ${stroke * 3}`}
                style={{ cursor: readOnly ? 'pointer' : 'move' }}
                onPointerDown={(e) => begin(e, 'photo', slot.id, 'move')}
              />
              <g pointerEvents="none">
                <circle cx={x + handle * 1.6} cy={y + handle * 1.6} r={handle * 1.2} fill={selected ? '#c9861a' : '#2b2420'} />
                <text x={x + handle * 1.6} y={y + handle * 1.6} fill="#fff" fontSize={handle * 1.3} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                  {i + 1}
                </text>
              </g>
              {selected && !readOnly &&
                (
                  [
                    ['nw', x, y],
                    ['ne', x + w, y],
                    ['sw', x, y + h],
                    ['se', x + w, y + h],
                  ] as const
                ).map(([corner, hx, hy]) => (
                  <rect
                    key={corner}
                    x={hx - handle / 2}
                    y={hy - handle / 2}
                    width={handle}
                    height={handle}
                    fill="#fff"
                    stroke="#c9861a"
                    strokeWidth={stroke}
                    style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={(e) => begin(e, 'photo', slot.id, corner)}
                  />
                ))}
            </g>
          );
        })}
        {template.textSlots.map((slot) => {
          const x = slot.x * W;
          const y = slot.y * H;
          const w = slot.width * W;
          const h = slot.height * H;
          const selected = slot.id === selectedId;
          return (
            <g key={slot.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={selected ? 'rgba(46,107,160,0.14)' : 'rgba(255,255,255,0.001)'}
                stroke={selected ? '#2e6ba0' : 'rgba(46,107,160,0.7)'}
                strokeWidth={selected ? stroke * 1.6 : stroke}
                strokeDasharray={`${stroke * 2} ${stroke * 2}`}
                style={{ cursor: readOnly ? 'pointer' : 'move' }}
                onPointerDown={(e) => begin(e, 'text', slot.id, 'move')}
              />
              {selected && !readOnly && (
                <rect
                  x={x + w - handle / 2}
                  y={y + h - handle / 2}
                  width={handle}
                  height={handle}
                  fill="#fff"
                  stroke="#2e6ba0"
                  strokeWidth={stroke}
                  style={{ cursor: 'nwse-resize' }}
                  onPointerDown={(e) => begin(e, 'text', slot.id, 'se')}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
