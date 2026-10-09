'use client';

import { FONT_MAP, type CalendarSlot, type PersonalizationTemplate, type PhotoSlot, type TextSlot } from '@bro-pics/shared';
import type { CalendarPatch, SlotPatch, TextPatch } from './template-draft';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink outline-none focus:border-ink disabled:bg-field disabled:text-ink/50';
const pct = (n: number) => Math.round(n * 10_000) / 100;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function NumberField({ label, value, onChange, step = 0.1, min, max, suffix, disabled }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">
        {label}
        {suffix && <span className="normal-case tracking-normal"> ({suffix})</span>}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={inputClass}
      />
    </label>
  );
}

function BoxFields({ box, onChange, disabled }: { box: { x: number; y: number; width: number; height: number }; onChange: (patch: SlotPatch) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <NumberField label="Left" suffix="%" value={pct(box.x)} onChange={(n) => onChange({ x: n / 100 })} disabled={disabled} />
      <NumberField label="Top" suffix="%" value={pct(box.y)} onChange={(n) => onChange({ y: n / 100 })} disabled={disabled} />
      <NumberField label="Width" suffix="%" value={pct(box.width)} onChange={(n) => onChange({ width: n / 100 })} disabled={disabled} />
      <NumberField label="Height" suffix="%" value={pct(box.height)} onChange={(n) => onChange({ height: n / 100 })} disabled={disabled} />
    </div>
  );
}

export function PhotoSlotInspector({
  template,
  slot,
  index,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  disabled,
}: {
  template: PersonalizationTemplate;
  slot: PhotoSlot;
  index: number;
  onChange: (patch: SlotPatch) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  disabled?: boolean;
}) {
  const inches = {
    w: (slot.width * template.canvas.width) / template.canvas.dpi,
    h: (slot.height * template.canvas.height) / template.canvas.dpi,
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Photo space {index + 1}</h3>
        <span className="text-2xs text-ink/50">
          {inches.w.toFixed(1)} × {inches.h.toFixed(1)} in printed
        </span>
      </div>
      {!disabled && template.photoSlots.length > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-tint px-2.5 py-1.5">
          <span className="text-2xs text-ink/65">Filled {ordinal(index + 1)} when customers add several photos</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-md border border-line bg-white px-2 py-1 text-2xs font-semibold text-ink disabled:opacity-40">
              Earlier
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === template.photoSlots.length - 1} className="rounded-md border border-line bg-white px-2 py-1 text-2xs font-semibold text-ink disabled:opacity-40">
              Later
            </button>
          </span>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Name customers see</span>
          <input value={slot.label} onChange={(e) => onChange({ label: e.target.value })} disabled={disabled} className={inputClass} />
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={slot.required} onChange={(e) => onChange({ required: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-[#c9861a]" />
          Required
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Shape</span>
          <select
            value={slot.shape}
            disabled={disabled || slot.shape === 'mask'}
            onChange={(e) => onChange({ shape: e.target.value as PhotoSlot['shape'], ...(e.target.value === 'rounded' && slot.cornerRadius === undefined && { cornerRadius: 0.1 }) })}
            className={inputClass}
          >
            <option value="rect">Rectangle</option>
            <option value="rounded">Rounded</option>
            <option value="ellipse">Oval / circle</option>
            {slot.polygon && <option value="polygon">Detected outline</option>}
            {slot.shape === 'mask' && <option value="mask">Mask image</option>}
          </select>
        </label>
        {slot.shape === 'rounded' && (
          <NumberField
            label="Corners"
            suffix="%"
            value={pct(slot.cornerRadius ?? 0.1)}
            min={0}
            max={50}
            step={1}
            onChange={(n) => onChange({ cornerRadius: Math.min(0.5, Math.max(0, n / 100)) })}
            disabled={disabled}
          />
        )}
        <NumberField label="Tilt" suffix="°" value={slot.rotationDeg} step={0.5} min={-180} max={180} onChange={(n) => onChange({ rotationDeg: Math.max(-180, Math.min(180, n)) })} disabled={disabled} />
      </div>
      <BoxFields box={slot} onChange={onChange} disabled={disabled} />
      <label className="flex items-start gap-2 rounded-lg bg-tint px-2.5 py-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={slot.removeBackground ?? false}
          onChange={(e) => onChange({ removeBackground: e.target.checked || undefined })}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 accent-[#c9861a]"
        />
        <span>
          <span className="font-semibold">Remove the photo&apos;s background</span>
          <span className="block text-ink/60">The people are cut out automatically, so whatever is under this space shows around them, e.g. a mosaic of small photos. Put this space above the others.</span>
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Hint (optional)</span>
        <input value={slot.hint ?? ''} placeholder="e.g. Bride, Main photo" onChange={(e) => onChange({ hint: e.target.value || undefined })} disabled={disabled} className={inputClass} />
      </label>
      {!disabled && (
        <div className="flex gap-2">
          <button type="button" onClick={onDuplicate} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink">
            Duplicate
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-alert hover:border-alert">
            Delete space
          </button>
        </div>
      )}
    </div>
  );
}

export function TextSlotInspector({ slot, onChange, onRemove, disabled }: { slot: TextSlot; onChange: (patch: TextPatch) => void; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Text: {slot.label}</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Name customers see</span>
          <input value={slot.label} onChange={(e) => onChange({ label: e.target.value })} disabled={disabled} className={inputClass} />
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={slot.required} onChange={(e) => onChange({ required: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-[#c9861a]" />
          Required
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Starting text</span>
          <input value={slot.defaultValue} onChange={(e) => onChange({ defaultValue: e.target.value })} disabled={disabled} className={inputClass} />
        </label>
        <NumberField label="Max length" value={slot.maxLength} step={1} min={1} max={200} onChange={(n) => onChange({ maxLength: Math.max(1, Math.round(n)) })} disabled={disabled} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Align</span>
          <select value={slot.align} onChange={(e) => onChange({ align: e.target.value as TextSlot['align'] })} disabled={disabled} className={inputClass}>
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Font</span>
          <select value={slot.defaultFontFamily ?? FONT_MAP[0].key} onChange={(e) => onChange({ defaultFontFamily: e.target.value })} disabled={disabled} className={inputClass}>
            {FONT_MAP.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Colour</span>
          <input type="color" value={slot.defaultColor ?? '#000000'} onChange={(e) => onChange({ defaultColor: e.target.value })} disabled={disabled} className="h-9 w-full cursor-pointer rounded-lg border border-line bg-white" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Smallest size" suffix="px at 400" value={slot.minFontSizePx ?? 8} step={1} min={4} onChange={(n) => onChange({ minFontSizePx: Math.max(4, n) })} disabled={disabled} />
        <NumberField label="Largest size" suffix="px at 400" value={slot.maxFontSizePx ?? 32} step={1} min={4} onChange={(n) => onChange({ maxFontSizePx: Math.max(4, n) })} disabled={disabled} />
      </div>
      <BoxFields box={slot} onChange={onChange} disabled={disabled} />
      {!disabled && (
        <button type="button" onClick={onRemove} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-alert hover:border-alert">
          Delete text
        </button>
      )}
    </div>
  );
}

function FontSelect({ label, value, onChange, disabled }: { label: string; value: string; onChange: (key: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
        {FONT_MAP.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColourField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (hex: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-9 w-full cursor-pointer rounded-lg border border-line bg-white" />
    </label>
  );
}

export function CalendarSlotInspector({ slot, onChange, onRemove, disabled }: { slot: CalendarSlot; onChange: (patch: CalendarPatch) => void; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Calendar: {slot.label}</h3>
      <p className="text-xs leading-relaxed text-ink/60">The customer picks a date. The calendar shows that month and marks the day.</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Name customers see</span>
          <input value={slot.label} onChange={(e) => onChange({ label: e.target.value })} disabled={disabled} className={inputClass} />
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={slot.required} onChange={(e) => onChange({ required: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-[#c9861a]" />
          Required
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Starting date (optional)</span>
          <input type="date" value={slot.defaultDate ?? ''} onChange={(e) => onChange({ defaultDate: e.target.value || undefined })} disabled={disabled} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Week starts on</span>
          <select value={slot.weekStart} onChange={(e) => onChange({ weekStart: e.target.value as CalendarSlot['weekStart'] })} disabled={disabled} className={inputClass}>
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FontSelect label="Month font" value={slot.titleFont} onChange={(titleFont) => onChange({ titleFont })} disabled={disabled} />
        <FontSelect label="Days font" value={slot.bodyFont} onChange={(bodyFont) => onChange({ bodyFont })} disabled={disabled} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ColourField label="Calendar colour" value={slot.color} onChange={(color) => onChange({ color })} disabled={disabled} />
        <ColourField label="Mark colour" value={slot.markColor} onChange={(markColor) => onChange({ markColor })} disabled={disabled} />
        <ColourField label="Marked day number" value={slot.markTextColor} onChange={(markTextColor) => onChange({ markTextColor })} disabled={disabled} />
      </div>
      <div className="grid grid-cols-3 items-end gap-2">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Mark</span>
          <select value={slot.mark} onChange={(e) => onChange({ mark: e.target.value as CalendarSlot['mark'] })} disabled={disabled} className={inputClass}>
            <option value="heart">Heart</option>
            <option value="circle">Circle</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={slot.leadingZero} onChange={(e) => onChange({ leadingZero: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-[#c9861a]" />
          05, not 5
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={slot.showRule} onChange={(e) => onChange({ showRule: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-[#c9861a]" />
          Line under month
        </label>
      </div>
      <div className="grid grid-cols-3 items-end gap-2">
        <label className="flex h-9 items-center gap-1.5 text-xs text-ink">
          <input
            type="checkbox"
            checked={Boolean(slot.panelColor)}
            onChange={(e) => onChange({ panelColor: e.target.checked ? '#000000' : undefined })}
            disabled={disabled}
            className="h-4 w-4 accent-[#c9861a]"
          />
          Panel behind it
        </label>
        {slot.panelColor && (
          <>
            <ColourField label="Panel colour" value={slot.panelColor} onChange={(panelColor) => onChange({ panelColor })} disabled={disabled} />
            <NumberField label="Panel" suffix="% solid" value={Math.round(slot.panelOpacity * 100)} min={0} max={100} step={5} onChange={(n) => onChange({ panelOpacity: Math.min(1, Math.max(0, n / 100)) })} disabled={disabled} />
          </>
        )}
      </div>
      <BoxFields box={slot} onChange={onChange} disabled={disabled} />
      {!disabled && (
        <button type="button" onClick={onRemove} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-alert hover:border-alert">
          Delete calendar
        </button>
      )}
    </div>
  );
}
