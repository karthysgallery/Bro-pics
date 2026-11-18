'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Hue 0–360, saturation and brightness 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

/** "#rrggbb" (or "#rgb") to its parts, or null when it is not a hex colour. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let v = hex.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/.test(v)) return null;
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

/** Follows a pointer drag inside an element, reporting the position as 0–1 fractions of its width and height. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onMove(clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height));
  };
  return {
    ref,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      move(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons || e.pointerType === 'touch') move(e);
    },
  };
}

interface Props {
  /** The colour when the picker opened (#rrggbb). */
  value: string;
  /** Every change while choosing, so the preview follows along. */
  onChange: (hex: string) => void;
  /** "Done": keep the colour. */
  onDone: (hex: string) => void;
  /** "Cancel": the caller puts back the colour it had when the picker opened. */
  onCancel: () => void;
  label?: string;
}

/**
 * A full colour picker: drag in the square for shade (saturation left to right, brightness top to bottom), drag
 * the rainbow bar for the hue, or type an exact HEX or RGB value. Works with a finger: dragging never scrolls the
 * page (touch-action: none), and every control can also be used from the keyboard (arrow keys).
 */
export function ColorPicker({ value, onChange, onDone, onCancel, label = 'Colour' }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
  const hex = hsvToHex(hsv);
  const rgb = hexToRgb(hex)!;
  const [hexDraft, setHexDraft] = useState(hex);
  const [hexError, setHexError] = useState(false);

  // Keep the HEX box in step with dragging (but not while the customer is typing in it).
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setHexDraft(hex);
  }, [hex]);

  const update = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const area = useDrag((x, y) => update({ ...hsv, s: x, v: 1 - y }));
  // From white, grey or black a hue alone changes nothing visible, so picking a hue then gives its full colour.
  const hue = useDrag((x) => update({ h: Math.min(359.9, x * 360), s: hsv.s < 0.05 ? 1 : hsv.s, v: hsv.v < 0.05 ? 1 : hsv.v }));

  const setFromHex = (text: string) => {
    const next = hexToHsv(text.startsWith('#') ? text : `#${text}`);
    setHexError(!next);
    if (next) update(next.s === 0 ? { ...next, h: hsv.h } : next);
  };

  const setChannel = (channel: 'r' | 'g' | 'b', n: number) => {
    if (!Number.isFinite(n)) return;
    const next = { ...rgb, [channel]: clamp(Math.round(n), 0, 255) };
    const h = hexToHsv(rgbToHex(next.r, next.g, next.b))!;
    update(h.s === 0 ? { ...h, h: hsv.h } : h);
  };

  const nudge = (e: React.KeyboardEvent, axis: 'area' | 'hue') => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const d = keys[e.key];
    if (!d) return;
    e.preventDefault();
    if (axis === 'area') update({ ...hsv, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) });
    else update({ ...hsv, h: clamp(hsv.h + (d[0] || d[1]) * 360, 0, 359.9) });
  };

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-paper p-3 shadow-sm" role="group" aria-label={`Choose ${label.toLowerCase()}`}>
      <div
        {...area}
        role="slider"
        tabIndex={0}
        aria-label="Shade: drag for lighter, darker, softer or stronger"
        aria-valuetext={hex}
        onKeyDown={(e) => nudge(e, 'area')}
        className="relative h-40 w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ink"
        style={{ backgroundColor: pureHue, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
        />
      </div>

      <div
        {...hue}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(e) => nudge(e, 'hue')}
        className="relative h-4 w-full cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHue }}
        />
      </div>

      <div className="flex items-end gap-2">
        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-lg border border-line" style={{ backgroundColor: hex }} />
        <label className="flex min-w-0 flex-1 flex-col text-2xs font-semibold text-ink/60">
          HEX
          <input
            value={hexDraft}
            spellCheck={false}
            autoCapitalize="off"
            onFocus={(e) => {
              typing.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              typing.current = false;
              setHexDraft(hex);
              setHexError(false);
            }}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const t = e.target.value.trim();
              if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) setFromHex(t);
              else setHexError(t.replace('#', '').length >= 6);
            }}
            aria-invalid={hexError || undefined}
            className={`mt-0.5 h-10 w-full rounded-lg border bg-white px-2 font-mono text-sm uppercase text-ink outline-none focus:border-ink ${hexError ? 'border-alert' : 'border-line'}`}
          />
        </label>
        {(['r', 'g', 'b'] as const).map((c) => (
          <label key={c} className="flex w-12 shrink-0 flex-col text-2xs font-semibold uppercase text-ink/60">
            {c}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={255}
              value={rgb[c]}
              onChange={(e) => setChannel(c, Number(e.target.value))}
              className="mt-0.5 h-10 w-full rounded-lg border border-line bg-white px-1 text-center text-sm text-ink outline-none focus:border-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
        ))}
      </div>
      {hexError && <p className="text-2xs text-alert">Type a colour code like #C9A24B.</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-full border border-line text-sm font-semibold text-ink hover:border-ink/50">
          Cancel
        </button>
        <button type="button" onClick={() => onDone(hex)} className="h-10 flex-1 rounded-full bg-ink text-sm font-semibold text-paper hover:bg-ink/85">
          Done
        </button>
      </div>
    </div>
  );
}
