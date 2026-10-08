'use client';

import { FONT_MAP, formatCalendarDate, parseCalendarDate, type CalendarSlot, type TextSlot } from '@bro-pics/shared';
import { TEXT_COLOR_OPTIONS } from '../../lib/text-personalization-options';
import { Icon } from './icons';
import { fontKeyOf } from './render-template';
import type { TemplateCustomizer } from './use-template-customizer';

interface CustomizerControlsProps {
  customizer: TemplateCustomizer;
  onAddPhotos: () => void;
  onRequestPhoto: (slotId: string) => void;
}

const TIER_LABEL = { green: 'Sharp', amber: 'Good', red: 'Low resolution' } as const;
const TIER_DOT = { green: 'bg-[#2f8f5b]', amber: 'bg-[#d29a2b]', red: 'bg-alert' } as const;

function CalendarField({ customizer, slot }: { customizer: TemplateCustomizer; slot: CalendarSlot }) {
  const picked = customizer.state.dates?.[slot.id]?.date ?? '';
  const inputId = `date-${slot.id}`;
  const shown = picked || slot.defaultDate || '';
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink">
        {slot.label}
        {slot.required && <span className="text-ink/50"> (required)</span>}
      </label>
      <input
        id={inputId}
        type="date"
        value={picked}
        min="1900-01-01"
        max="2200-12-31"
        onChange={(e) => customizer.setDate(slot.id, parseCalendarDate(e.target.value) ? e.target.value : null)}
        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink"
      />
      <p className="text-xs text-ink/60">
        {shown ? `The calendar shows ${formatCalendarDate(shown)}, with that day marked.` : 'Pick the day to mark: the calendar shows its month.'}
      </p>
    </div>
  );
}

function TextField({ customizer, slot }: { customizer: TemplateCustomizer; slot: TextSlot }) {
  const value = customizer.state.texts[slot.id];
  const text = value?.value ?? slot.defaultValue;
  const fontKey = fontKeyOf(value?.fontFamily, slot.defaultFontFamily);
  const colour = value?.color ?? slot.defaultColor ?? '#000000';
  const fonts = slot.allowedFonts?.length ? FONT_MAP.filter((f) => slot.allowedFonts!.includes(f.key)) : FONT_MAP;
  const colours = slot.allowedColors?.length ? slot.allowedColors.map((c) => ({ key: c, label: c, value: c })) : TEXT_COLOR_OPTIONS;
  const inputId = `text-${slot.id}`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
          {slot.label}
          {slot.required && <span className="text-ink/50"> (required)</span>}
        </label>
        <span className="text-2xs text-ink/50">
          {text.length}/{slot.maxLength}
        </span>
      </div>
      <input
        id={inputId}
        value={text}
        maxLength={slot.maxLength}
        onChange={(e) => customizer.updateText(slot.id, { value: e.target.value })}
        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink"
        placeholder={slot.label}
      />
      <div role="radiogroup" aria-label={`Font for ${slot.label}`} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {fonts.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={fontKey === f.key}
            title={f.label}
            onClick={() => customizer.updateText(slot.id, { fontFamily: f.key })}
            className={`h-9 shrink-0 rounded-lg border px-3 text-[15px] transition-colors ${fontKey === f.key ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink/50'}`}
            style={{ fontFamily: `var(${f.cssVariable})` }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={`Colour for ${slot.label}`} className="flex flex-wrap gap-2">
        {colours.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={colour.toLowerCase() === c.value.toLowerCase()}
            aria-label={c.label}
            title={c.label}
            onClick={() => customizer.updateText(slot.id, { color: c.value })}
            className={`h-8 w-8 rounded-full border-2 transition-transform ${colour.toLowerCase() === c.value.toLowerCase() ? 'scale-110 border-ink' : 'border-white shadow-[0_0_0_1px_rgba(43,36,32,0.2)]'}`}
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Right column of a template product page (inside the buy box): every photo
 * space at a glance, a bulk "Add photos", photo quality, and the text fields.
 */
export function CustomizerControls({ customizer, onAddPhotos, onRequestPhoto }: CustomizerControlsProps) {
  const { template, state, activeSlotId, completeness, activity } = customizer;
  const total = template.photoSlots.length;
  const filled = template.photoSlots.filter((s) => state.slots[s.id]).length;
  const empty = total - filled;
  const statusBySlot = new Map(completeness.slots.map((s) => [s.slotId, s]));
  const active = template.photoSlots.find((s) => s.id === activeSlotId) ?? null;
  const activeStatus = active ? statusBySlot.get(active.id) : undefined;
  const activePhoto = active ? state.slots[active.id] : undefined;
  const errors = Object.entries(activity).filter(([, a]) => a.error);
  const unavailable = new Set(customizer.unavailableSlots);

  return (
    <section aria-labelledby="your-photos" className="my-4 space-y-4 rounded-2xl border border-line bg-paper p-4">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="your-photos" className="font-display text-lg font-semibold text-ink">
            {total === 1 ? 'Your photo' : 'Your photos'}
          </h2>
          <span className="text-xs font-medium text-ink/60" aria-live="polite">
            {filled} of {total} added
          </span>
        </div>
        {total > 1 && (
          <p className="text-xs leading-relaxed text-ink/60">
            {empty > 0
              ? `Pick up to ${empty} photo${empty === 1 ? '' : 's'} at once: they fill the empty spaces in order. Tap any space to swap or adjust it.`
              : 'Every space has a photo. Tap one to swap or adjust it.'}
          </p>
        )}
      </header>

      <button
        type="button"
        onClick={onAddPhotos}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink bg-ink text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
      >
        <Icon name="photos" />
        {filled === 0 ? (total === 1 ? 'Add your photo' : 'Add photos') : empty > 0 ? `Add ${empty === 1 ? 'the last photo' : `${empty} more photos`}` : 'Replace photos'}
      </button>

      {customizer.notice && (
        <p role="status" className="rounded-xl bg-tint px-3 py-2 text-xs text-ink/80">
          {customizer.notice}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1">
          {errors.map(([slotId, a]) => (
            <li key={slotId} className="flex items-start gap-2 text-xs text-alert">
              <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
              <span>
                {template.photoSlots.find((s) => s.id === slotId)?.label}: {a.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > 1 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {template.photoSlots.map((slot, i) => {
            const photo = state.slots[slot.id];
            const src = photo ? customizer.render.photoSrc(slot.id, photo) : null;
            const status = statusBySlot.get(slot.id);
            const busy = activity[slot.id]?.uploading;
            const isActive = slot.id === activeSlotId;
            return (
              <li key={slot.id}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${slot.label}: ${photo ? (unavailable.has(slot.id) ? 'photo could not be loaded' : 'photo added') : 'empty, add a photo'}`}
                  onClick={() => {
                    customizer.setActiveSlotId(slot.id);
                    if (!photo) onRequestPhoto(slot.id);
                  }}
                  className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 bg-tint transition-colors ${isActive ? 'border-gold' : 'border-transparent hover:border-line'}`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name={unavailable.has(slot.id) ? 'alert' : 'plus'} className="h-5 w-5 text-ink/45" />
                  )}
                  <span className="absolute left-1 top-1 rounded-full bg-paper/90 px-1.5 text-2xs font-semibold text-ink">{i + 1}</span>
                  {busy && <span className="absolute inset-x-0 bottom-0 h-1 animate-pulse bg-gold" aria-hidden="true" />}
                  {status?.tier && !busy && (
                    <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-paper ${TIER_DOT[status.tier]}`} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active && activePhoto && activeStatus?.tier && (
        <div className="space-y-2 rounded-xl border border-line/80 px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs text-ink/75">
            <span className={`h-2.5 w-2.5 rounded-full ${TIER_DOT[activeStatus.tier]}`} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-ink">{active.label}</strong> · {TIER_LABEL[activeStatus.tier]}
              {activeStatus.dpi ? ` (${Math.round(activeStatus.dpi)} DPI at this size)` : ''}
            </span>
          </p>
          {activeStatus.message && <p className="text-xs text-ink/60">{activeStatus.message}</p>}
          {activeStatus.tier === 'red' && (
            <label className="flex items-start gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={activePhoto.confirmedLowDpi}
                onChange={(e) => customizer.setLowDpiConfirmed(active.id, e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#c9861a]"
              />
              <span>Print this photo anyway. I understand it may look soft.</span>
            </label>
          )}
        </div>
      )}

      {(template.calendarSlots ?? []).length > 0 && (
        <div className="space-y-4 border-t border-line pt-4">
          {(template.calendarSlots ?? []).map((slot) => (
            <CalendarField key={slot.id} customizer={customizer} slot={slot} />
          ))}
        </div>
      )}

      {template.textSlots.length > 0 && (
        <div className="space-y-4 border-t border-line pt-4">
          {template.textSlots.map((slot) => (
            <TextField key={slot.id} customizer={customizer} slot={slot} />
          ))}
        </div>
      )}
    </section>
  );
}
