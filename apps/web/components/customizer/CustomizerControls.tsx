'use client';

import { useEffect, useMemo, useState } from 'react';
import { ENGLISH_ONLY_MESSAGE, FONT_MAP, LOW_RES_CONFIRMATION_REQUIRED, formatCalendarDate, isEnglishText, parseCalendarDate, parseSpotifyLink, type CalendarSlot, type TextSlot } from '@bro-pics/shared';
import { ColorPicker } from '../ui/ColorPicker';
import { QUICK_TEXT_COLORS, toHexColor } from '../../lib/text-personalization-options';
import { Icon } from './icons';
import { fontKeyOf } from './render-template';
import type { TemplateCustomizer } from './use-template-customizer';

interface CustomizerControlsProps {
  customizer: TemplateCustomizer;
  onAddPhotos: () => void;
  onRequestPhoto: (slotId: string) => void;
  /** Opens the editor (zoom, move, rotate, fit) on this space's photo. */
  onEditPhoto?: (slotId: string) => void;
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

/** A Spotify space: the customer pastes a link from the Spotify app and the design shows its scannable code. */
function SpotifyField({ customizer, slot }: { customizer: TemplateCustomizer; slot: TextSlot }) {
  const value = customizer.state.texts[slot.id];
  const text = value?.value ?? slot.defaultValue;
  const valid = !text.trim() || Boolean(parseSpotifyLink(text));
  const inputId = `text-${slot.id}`;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink">
        {slot.label}
      </label>
      <input
        id={inputId}
        type="url"
        inputMode="url"
        value={text}
        maxLength={slot.maxLength}
        onChange={(e) => customizer.updateText(slot.id, { value: e.target.value })}
        aria-invalid={!valid || undefined}
        aria-describedby={`${inputId}-help`}
        className={`h-11 w-full rounded-xl border bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink ${valid ? 'border-line' : 'border-alert'}`}
        placeholder="https://open.spotify.com/track/…"
      />
      <p id={`${inputId}-help`} className={`text-xs ${valid ? 'text-ink/60' : 'text-alert'}`}>
        {valid
          ? 'In Spotify, open your song, tap Share, then Copy link, and paste it here. The code on the frame plays that song when scanned.'
          : 'This is not a Spotify link. In Spotify, tap Share, then Copy link (it starts with open.spotify.com).'}
      </p>
    </div>
  );
}

function TextField({ customizer, slot }: { customizer: TemplateCustomizer; slot: TextSlot }) {
  const [picking, setPicking] = useState<{ before: string | undefined } | null>(null);
  if (slot.spotifyCode) return <SpotifyField customizer={customizer} slot={slot} />;
  const value = customizer.state.texts[slot.id];
  const text = value?.value ?? slot.defaultValue;
  const fontKey = fontKeyOf(value?.fontFamily, slot.defaultFontFamily);
  const colour = value?.color ?? slot.defaultColor ?? '#000000';
  const fonts = slot.allowedFonts?.length ? FONT_MAP.filter((f) => slot.allowedFonts!.includes(f.key)) : FONT_MAP;
  // One-tap colours: the designer's own colours for this design when it has them, else four common ones. The full
  // colour picker is always offered as well, so the customer can choose any colour.
  const suggested = slot.allowedColors?.length ? slot.allowedColors.map((c) => ({ key: c, label: c.toUpperCase(), value: c })) : QUICK_TEXT_COLORS;
  const isSuggested = suggested.some((c) => c.value.toLowerCase() === colour.toLowerCase());
  const hex = toHexColor(colour) ?? '#111111';
  const inputId = `text-${slot.id}`;
  const notEnglish = !isEnglishText(text);
  const setColour = (color: string | undefined) => customizer.updateText(slot.id, { color });

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
        lang="en"
        onChange={(e) => customizer.updateText(slot.id, { value: e.target.value })}
        aria-invalid={notEnglish || undefined}
        aria-describedby={notEnglish ? `${inputId}-lang` : undefined}
        className={`h-11 w-full rounded-xl border bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink ${notEnglish ? 'border-alert' : 'border-line'}`}
        placeholder={slot.label}
      />
      {notEnglish && (
        <p id={`${inputId}-lang`} role="alert" className="text-xs text-alert">
          {ENGLISH_ONLY_MESSAGE}
        </p>
      )}
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold text-ink/70">Text colour</span>
          <div role="radiogroup" aria-label={`Colour for ${slot.label}`} className="flex flex-wrap items-center">
            {suggested.map((c) => {
              const on = colour.toLowerCase() === c.value.toLowerCase();
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => {
                    setPicking(null);
                    setColour(c.value);
                  }}
                  className="flex h-11 w-9 items-center justify-center"
                >
                  <span
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${on ? 'scale-110 border-ink' : 'border-white shadow-[0_0_0_1px_rgba(43,36,32,0.25)]'}`}
                    style={{ backgroundColor: c.value }}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-expanded={Boolean(picking)}
            onClick={() => (picking ? setPicking(null) : setPicking({ before: value?.color }))}
            className={`flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 text-xs font-semibold text-ink transition-colors ${!isSuggested || picking ? 'border-ink' : 'border-line hover:border-ink/50'}`}
          >
            <span
              aria-hidden="true"
              className="h-7 w-7 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(43,36,32,0.25)]"
              style={isSuggested && !picking ? { background: 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)' } : { backgroundColor: colour }}
            />
            {!isSuggested ? hex.toUpperCase() : 'Choose colour'}
          </button>
        </div>
        {picking && (
          <ColorPicker
            key={slot.id}
            label={`${slot.label} colour`}
            value={hex}
            onChange={(next) => setColour(next)}
            onDone={(next) => {
              setColour(next);
              setPicking(null);
            }}
            onCancel={() => {
              setColour(picking.before);
              setPicking(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Photos picked beyond the free spaces: shown, never dropped. Tap one to put it in the selected space. */
function ExtraPhotos({ customizer }: { customizer: TemplateCustomizer }) {
  const urls = useMemo(() => customizer.extras.map((f) => URL.createObjectURL(f)), [customizer.extras]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const target = customizer.activeSlotId ?? customizer.template.photoSlots[0]?.id ?? null;
  const targetLabel = customizer.template.photoSlots.find((s) => s.id === target)?.label ?? 'the selected space';
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-ink/30 p-3" data-testid="extra-photos">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-ink">Not placed yet ({customizer.extras.length})</p>
        <button type="button" onClick={customizer.clearExtras} className="font-medium text-ink/60 underline hover:text-ink">Remove all</button>
      </div>
      <p className="text-xs text-ink/60">Tap a photo to put it in {targetLabel}. Select another space above first to place it there.</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {customizer.extras.map((f, i) => (
          <li key={`${f.name}-${i}`} className="relative shrink-0">
            <button type="button" onClick={() => target && customizer.placeExtra(i, target)} aria-label={`Put ${f.name} in ${targetLabel}`} className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt="" className="h-full w-full object-cover" />
            </button>
            <button type="button" onClick={() => customizer.removeExtra(i)} aria-label={`Remove ${f.name}`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-paper">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The optional add-on: what it is, why it is worth adding (the space's hint), and one button to add it. */
function AddOnHeader({ customizer, filled, onAdd }: { customizer: TemplateCustomizer; filled: number; onAdd: () => void }) {
  const slots = customizer.template.photoSlots;
  const title = slots.length === 1 ? slots[0]!.label : 'Your photos';
  const hint = slots.length === 1 ? slots[0]!.hint : undefined;
  const done = filled === slots.length;
  return (
    <header className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="your-photos" className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <span className="rounded-full bg-tint px-2 py-0.5 text-2xs font-semibold text-ink/70">Optional</span>
        </div>
        {hint && <p className="text-[13px] leading-relaxed text-ink/75">{hint}</p>}
      </div>
      {!done && (
        <button
          type="button"
          onClick={() => {
            customizer.setPhotosVia('upload');
            onAdd();
          }}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-ink bg-ink px-4 py-3.5 text-left text-paper shadow-md transition-all hover:bg-ink/90 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <span className="min-w-0 text-[15px] font-bold">{slots.length === 1 ? `Add ${lowerFirst(title)}` : 'Add your photos'}</span>
        </button>
      )}
      <p className="text-xs text-ink/60">
        {done ? 'Added. It is printed in its place on your frame.' : 'You can skip this: the frame then comes exactly as shown.'}
      </p>
    </header>
  );
}

/**
 * The main (cut-out) photo of an "at least N photos" collage, asked for on its own so a bulk pick never lands in it.
 */
function MainPhotoCard({
  customizer,
  slot,
  onRequestPhoto,
  onEditPhoto,
}: {
  customizer: TemplateCustomizer;
  slot: TemplateCustomizer['template']['photoSlots'][number];
  onRequestPhoto: (slotId: string) => void;
  onEditPhoto?: (slotId: string) => void;
}) {
  const photo = customizer.state.slots[slot.id];
  const src = photo ? customizer.render.photoSrc(slot.id, photo) : null;
  const busy = customizer.activity[slot.id]?.uploading;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${photo ? 'border-emerald-600/50 bg-paper' : 'border-dashed border-ink/40 bg-tint/60'}`}>
      <button
        type="button"
        onClick={() => {
          customizer.setPhotosVia('upload');
          customizer.setActiveSlotId(slot.id);
          if (!photo) onRequestPhoto(slot.id);
          else onEditPhoto?.(slot.id);
        }}
        aria-label={`${slot.label}: ${photo ? 'photo added, edit it' : 'empty, upload it'}`}
        className="relative flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="plus" className="h-6 w-6 text-ink/50" />
        )}
        {busy && <span className="absolute inset-x-0 bottom-0 h-1 animate-pulse bg-gold" aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          {slot.label}
          <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${photo ? 'bg-emerald-600/10 text-emerald-700' : 'bg-ink/10 text-ink/70'}`}>
            {photo ? 'Added' : 'Required'}
          </span>
        </p>
        {slot.hint && <p className="text-xs leading-snug text-ink/65">{slot.hint}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              customizer.setPhotosVia('upload');
              onRequestPhoto(slot.id);
            }}
            className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${photo ? 'border border-line bg-paper text-ink hover:border-ink/50' : 'bg-ink text-paper hover:bg-ink/85'}`}
          >
            {photo ? 'Change main photo' : 'Upload main photo'}
          </button>
          {photo && onEditPhoto && (
            <button type="button" onClick={() => onEditPhoto(slot.id)} className="h-9 rounded-lg border border-ink bg-ink px-3 text-xs font-semibold text-paper hover:bg-ink/85">
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Right column of a template product page (inside the buy box): every photo
 * space at a glance, a bulk "Add photos", photo quality, and the text fields.
 */
export function CustomizerControls({ customizer, onAddPhotos, onRequestPhoto, onEditPhoto }: CustomizerControlsProps) {
  const { template, state, activeSlotId, completeness, activity } = customizer;
  const total = template.photoSlots.length;
  const filled = template.photoSlots.filter((s) => state.slots[s.id]).length;
  const empty = total - filled;
  const statusBySlot = new Map(completeness.slots.map((s) => [s.slotId, s]));
  const active = template.photoSlots.find((s) => s.id === activeSlotId) ?? null;
  const activeStatus = active ? statusBySlot.get(active.id) : undefined;
  const regularSlots = template.photoSlots.filter((s) => !s.removeBackground);
  const filledRegular = regularSlots.filter((s) => state.slots[s.id]).length;
  const emptyRegular = regularSlots.length - filledRegular;
  const activePhoto = active ? state.slots[active.id] : undefined;
  const errors = Object.entries(activity).filter(([, a]) => a.error);
  const unavailable = new Set(customizer.unavailableSlots);
  // Every photo space optional (e.g. "Your last movie ticket" on a ready-made poster): an add-on the customer may skip,
  // so the page offers it as such instead of asking how they will send their photos.
  const addOn = total > 0 && template.photoSlots.every((s) => !s.required);
  const byWhatsApp = !addOn && state.photosVia === 'whatsapp';
  const firstEmpty = template.photoSlots.find((s) => !state.slots[s.id]);
  const uploadingCount = Object.values(activity).filter((a) => a.uploading).length;
  // An "at least N photos" collage: the main photo is asked for on its own, the count is of the collage cells.
  const count = completeness.photoCount;
  const mainSlots = count ? template.photoSlots.filter((s) => s.required) : [];
  const gridSlots = count ? template.photoSlots.filter((s) => !s.required) : template.photoSlots;
  const emptyCells = count ? count.max - count.filled : empty;

  return (
    <section aria-labelledby="your-photos" className="my-4 space-y-4 rounded-2xl border border-line bg-paper p-4">
      {addOn ? (
        <AddOnHeader
          customizer={customizer}
          filled={filled}
          onAdd={() => (total > 1 && empty > 1 ? onAddPhotos() : firstEmpty && onRequestPhoto(firstEmpty.id))}
        />
      ) : (
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="your-photos" className="font-display text-lg font-semibold text-ink">
            {total === 1 ? 'Your photo' : 'Your photos'}
          </h2>
          {!byWhatsApp && (
            <span className="text-xs font-medium text-ink/60" aria-live="polite">
              {count ? `${count.filled} of ${count.max} added` : `${filled} of ${total} added`}
            </span>
          )}
        </div>
        {count && !byWhatsApp ? (
          <p className="text-xs leading-relaxed text-ink/60">
            Add your main photo, then at least {count.min} and up to {count.max} photos for the collage. Pick them all at once: they fill the collage in order. Tap any space to swap or adjust it.
          </p>
        ) : total > 1 && !byWhatsApp && (
          <p className="text-xs leading-relaxed text-ink/60">
            {empty > 0
              ? `Pick up to ${empty} photo${empty === 1 ? '' : 's'} at once: they fill the empty spaces in order. Tap any space to swap or adjust it.`
              : 'Every space has a photo. Tap one to swap or adjust it.'}
          </p>
        )}
      </header>
      )}

      {total > 0 && !addOn && (
        <div role="radiogroup" aria-label="How you will give us your photos" className="space-y-2.5">
          <button
            type="button"
            role="radio"
            aria-checked={!byWhatsApp}
            onClick={() => {
              customizer.setPhotosVia('upload');
              if ((count ? count.filled : filled) === 0) onAddPhotos();
            }}
            className={`group relative flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all active:scale-[0.99] ${
              !byWhatsApp ? 'border-ink bg-ink text-paper shadow-md' : 'border-ink/25 bg-paper text-ink hover:border-ink'
            }`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${!byWhatsApp ? 'bg-gold text-ink' : 'bg-tint text-ink'}`} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold uppercase tracking-wide">Add photos now</span>
              <span className={`mt-0.5 block text-xs leading-snug ${!byWhatsApp ? 'text-paper/80' : 'text-ink/65'}`}>
                {count
                  ? `Pick ${count.min} to ${count.max} photos at once, then add your main photo.`
                  : total > 1 ? `Pick all ${total} photos at once. Upload them and personalise your frame.` : 'Upload your photo and personalise your frame.'}
              </span>
            </span>
            {!byWhatsApp && filled > 0 && (
              <svg className="ml-auto shrink-0 text-gold" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
          </button>

          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-ink/40" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            role="radio"
            aria-checked={byWhatsApp}
            onClick={() => customizer.setPhotosVia('whatsapp')}
            className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all active:scale-[0.99] ${
              byWhatsApp ? 'border-[#1f9d55] bg-[#1f9d55] text-white shadow-md' : 'border-[#1f9d55]/60 bg-paper text-ink hover:border-[#1f9d55]'
            }`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${byWhatsApp ? 'bg-white text-[#1f9d55]' : 'bg-[#1f9d55] text-white'}`} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.2-1.2c-.1-.1-.3-.2-.6-.3z" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold uppercase tracking-wide">Send photos on WhatsApp</span>
              <span className={`mt-0.5 block text-xs leading-snug ${byWhatsApp ? 'text-white/85' : 'text-ink/65'}`}>Prefer WhatsApp? Order now and send your photos to us after paying.</span>
            </span>
            {byWhatsApp && (
              <svg className="ml-auto shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
          </button>
        </div>
      )}

      {byWhatsApp ? (
        <div className="space-y-2 rounded-xl bg-tint px-3 py-3 text-xs leading-relaxed text-ink/80">
          <p className="font-semibold text-ink">How it works</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Choose your size{template.textSlots.length > 0 ? ' and fill in the text below' : ''}, then add to cart and pay.</li>
            <li>On your order page, tap “Send photos on WhatsApp”. Your order number is filled in for you.</li>
            <li>
              {count
                ? `Send your main photo and ${count.min} to ${count.max} photos for the collage. Our team places them in the design and prints your frame.`
                : `Send your ${total} photo${total === 1 ? '' : 's'}. Our team places them in the design and prints your frame.`}
            </li>
          </ol>
        </div>
      ) : (
        <>
      {mainSlots.map((slot) => (
        <MainPhotoCard key={slot.id} customizer={customizer} slot={slot} onRequestPhoto={onRequestPhoto} onEditPhoto={onEditPhoto} />
      ))}

      {(count ? true : filled > 0) && emptyCells > 0 && (
        <button
          type="button"
          onClick={onAddPhotos}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink bg-ink text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
        >
          <Icon name="photos" />
          {count
            ? count.filled === 0
              ? `Add collage photos (pick ${count.min} to ${count.max})`
              : `Add more photos (${emptyCells} space${emptyCells === 1 ? '' : 's'} left)`
            : `Add ${empty === 1 ? 'the last photo' : `${empty} more photos`}`}
        </button>
      )}

        {count && (count.filled > 0 || uploadingCount > 0) && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-ink">
                {uploadingCount > 0
                  ? `Uploading ${uploadingCount} photo${uploadingCount === 1 ? '' : 's'}… you can keep going.`
                  : count.filled < count.min
                    ? `${count.min - count.filled} more photo${count.min - count.filled === 1 ? '' : 's'} needed (at least ${count.min})`
                    : count.filled < count.max
                      ? `Enough photos. Add up to ${count.max - count.filled} more, or leave the rest empty.`
                      : 'All photos added'}
              </span>
              <span className="shrink-0 tabular-nums text-ink/60">{count.filled}/{count.max}</span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-tint">
              <div className={`h-full rounded-full transition-all ${count.filled >= count.min && uploadingCount === 0 ? 'bg-emerald-600' : 'bg-gold'}`} style={{ width: `${Math.round((count.filled / count.max) * 100)}%` }} />
              <span className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ left: `${(count.min / count.max) * 100}%` }} aria-hidden="true" />
            </div>
          </div>
        )}

        {!count && total > 1 && (filled > 0 || uploadingCount > 0) && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink">
                {uploadingCount > 0
                  ? `Uploading ${uploadingCount} photo${uploadingCount === 1 ? '' : 's'}… you can keep going.`
                  : empty > 0
                    ? `${empty} more photo${empty === 1 ? '' : 's'} needed`
                    : 'All photos added'}
              </span>
              <span className="tabular-nums text-ink/60">{filled}/{total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-tint">
              <div className={`h-full rounded-full transition-all ${empty === 0 && uploadingCount === 0 ? 'bg-emerald-600' : 'bg-gold'}`} style={{ width: `${Math.round((filled / total) * 100)}%` }} />
            </div>
          </div>
        )}
  
        {customizer.notice && (
          <p role="status" className="rounded-xl bg-tint px-3 py-2 text-xs text-ink/80">
            {customizer.notice}
          </p>
        )}
        {customizer.extras.length > 0 && (
          <ExtraPhotos customizer={customizer} />
        )}
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1">
            {errors.map(([slotId, a]) => (
              <li key={slotId} className="flex items-start gap-2 text-xs text-alert">
                <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
                <span className="flex-1">
                  {template.photoSlots.find((s) => s.id === slotId)?.label}: {a.error}
                </span>
                {customizer.canRetry(slotId) && (
                  <button type="button" onClick={() => customizer.retryPhoto(slotId)} className="shrink-0 rounded-full border border-alert/50 px-2.5 py-0.5 font-semibold text-alert hover:bg-alert/10">
                    Try again
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
  
        {total > 1 && emptyRegular > 0 && filledRegular > 0 && !customizer.uploading && (
          <button
            type="button"
            onClick={() => customizer.repeatPhotos()}
            className="w-full rounded-xl border border-dashed border-ink/40 px-3 py-2 text-xs font-semibold text-ink hover:border-ink"
          >
            Fill the {emptyRegular} empty space{emptyRegular === 1 ? '' : 's'} by repeating your photos
          </button>
        )}
  
        {total >= 1 && (!addOn || filled > 0) && (
          <ul className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4">
            {gridSlots.map((slot, i) => {
              const photo = state.slots[slot.id];
              const src = photo ? customizer.render.photoSrc(slot.id, photo) : null;
              const status = statusBySlot.get(slot.id);
              const busy = activity[slot.id]?.uploading;
              const isActive = slot.id === activeSlotId;
              return (
                <li key={slot.id} className="flex flex-col gap-1.5">
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
                  {/* Under every space: choose a photo while it is empty; once it has one, change it or edit it. */}
                  {photo ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRequestPhoto(slot.id)}
                        aria-label={`Change image ${i + 1}`}
                        className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-line bg-paper text-[11px] font-semibold text-ink transition-colors hover:border-ink/50 active:bg-tint"
                      >
                        <Icon name="replace" className="h-3.5 w-3.5 shrink-0" />
                        Change Image
                      </button>
                      {onEditPhoto && (
                        <button
                          type="button"
                          onClick={() => onEditPhoto(slot.id)}
                          aria-label={`Edit image ${i + 1}`}
                          className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-ink bg-ink text-[11px] font-semibold text-paper transition-colors hover:bg-ink/85"
                        >
                          <Icon name="pen" className="h-3.5 w-3.5 shrink-0" />
                          Edit Image
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequestPhoto(slot.id)}
                      aria-label={`Choose image ${i + 1}`}
                      className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-ink/35 bg-paper text-[11px] font-semibold text-ink transition-colors hover:border-ink"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5 shrink-0" />
                      Choose Image
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
  
        {Object.entries(activity)
          .filter(([, a]) => a.working)
          .map(([slotId, a]) => (
            <p key={slotId} role="status" className="flex items-center gap-2 rounded-xl bg-tint px-3 py-2 text-xs text-ink">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />
              {template.photoSlots.find((s) => s.id === slotId)?.label}: {a.working} This takes about half a minute.
            </p>
          ))}
  
        {active && activePhoto && total > 1 && (
          <label className="flex items-center justify-between gap-2 rounded-xl border border-line/80 px-3 py-2 text-xs text-ink">
            <span>Move {active.label} to</span>
            <select
              value=""
              onChange={(e) => e.target.value && customizer.swapPhotos(active.id, e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink focus:border-gold focus:outline-none"
            >
              <option value="">Choose a space…</option>
              {template.photoSlots.filter((s) => s.id !== active.id).map((s) => (
                <option key={s.id} value={s.id}>{s.label}{state.slots[s.id] ? ' (swap)' : ' (empty)'}</option>
              ))}
            </select>
          </label>
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
            {LOW_RES_CONFIRMATION_REQUIRED && activeStatus.tier === 'red' && (
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
        </>
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
