'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AppearanceSchema,
  BUTTON_LABELS,
  BUTTON_STYLES,
  CORNER_LABELS,
  CORNER_STYLES,
  DEFAULT_APPEARANCE,
  FONT_CHOICES,
  PRODUCT_PAGE_SECTIONS,
  buttonRadius,
  cornerValues,
  fontChoice,
  resolveAppearance,
  type Appearance,
  type FontKey,
} from '@bro-pics/shared';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';

const card = 'space-y-3 rounded-2xl border border-line bg-paper p-5';
const sectionTitle = 'text-xs font-bold uppercase tracking-wider text-ink';
const select = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none';

/** Look of the shop beyond colours: typefaces, corners, buttons, tab icon, product-page sections. */
export default function AppearancePage() {
  const api = useAdminApi();
  const [saved, setSaved] = useState<Appearance | null>(null);
  const [draft, setDraft] = useState<Appearance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ value: unknown }>('/api/admin/settings/appearance');
      const value = resolveAppearance(res.value);
      setSaved(value);
      setDraft(value);
    } catch (error) {
      // No saved look yet is normal: the shop is using the original one.
      setSaved(DEFAULT_APPEARANCE);
      setDraft(DEFAULT_APPEARANCE);
      if (error instanceof Error && !/not.?found|404/i.test(error.message)) setMessage({ ok: false, text: error.message });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const isOriginal = useMemo(() => JSON.stringify(draft) === JSON.stringify(DEFAULT_APPEARANCE), [draft]);

  if (!draft || !saved) return <div className="mx-auto max-w-5xl p-6 md:p-8"><div className="h-96 animate-pulse rounded-2xl bg-field" /></div>;

  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setDraft({ ...draft, [key]: value });
  const fontStyle = (key: FontKey): CSSProperties => ({ fontFamily: `var(${fontChoice(key).cssVar}), system-ui, sans-serif` });
  const radii = cornerValues(draft.corners);
  const previewVars = Object.fromEntries(Object.entries(radii)) as CSSProperties;

  const save = async () => {
    const parsed = AppearanceSchema.safeParse(draft);
    if (!parsed.success) return setMessage({ ok: false, text: 'Something here is not valid.' });
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/admin/settings/appearance', { method: 'PUT', body: JSON.stringify(parsed.data) });
      setSaved(parsed.data);
      setMessage({ ok: true, text: 'Saved. The shop shows the new look within a minute.' });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  // A plain function (not a component): defining a component inside another remounts it on every render and drops focus.
  const fontSelect = (role: 'display' | 'body', label: string) => {
    const field = role === 'display' ? 'displayFont' : 'bodyFont';
    const options = FONT_CHOICES.filter((f) => (f.roles as readonly string[]).includes(role));
    return (
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-ink">{label}</span>
        <select className={select} value={draft[field]} onChange={(e) => set(field, e.target.value as FontKey)}>
          {options.map((f) => <option key={f.key} value={f.key}>{f.label} — {f.style}{f.key === DEFAULT_APPEARANCE[field] ? ' (current)' : ''}</option>)}
        </select>
      </label>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-28 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Appearance</h1>
          <p className="text-xs text-ink/60">
            Fonts, corners, buttons, the browser-tab icon and which sections the product page shows. Colours are in <a href="/admin/themes" className="font-semibold text-ink underline">Colours &amp; themes</a>.
            Everything starts as the shop looks today; nothing changes until you save.
          </p>
        </div>
        <button type="button" disabled={isOriginal} onClick={() => setDraft(DEFAULT_APPEARANCE)} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-field disabled:opacity-40">
          Reset to original look
        </button>
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>{message.text}</p>}

      <section className={card} aria-labelledby="fonts">
        <h2 id="fonts" className={sectionTitle}>Fonts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {fontSelect('display', 'Headings and prices')}
          {fontSelect('body', 'Everything else (body text, buttons)')}
        </div>
        <div className="rounded-xl border border-line bg-field p-4" aria-label="Font preview">
          <p className="text-2xl font-bold text-ink" style={fontStyle(draft.displayFont)}>Frames for a brighter you</p>
          <p className="mt-2 text-sm text-ink/80" style={fontStyle(draft.bodyFont)}>Upload your photo, preview it in the frame, and we make it to order. Inclusive of GST · Photo printing included.</p>
        </div>
      </section>

      <section className={card} aria-labelledby="shape">
        <h2 id="shape" className={sectionTitle}>Corners and buttons</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-ink">Card and image corners</legend>
            {CORNER_STYLES.map((c) => (
              <label key={c} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 ${draft.corners === c ? 'border-ink bg-tint' : 'border-line'}`}>
                <input type="radio" name="corners" checked={draft.corners === c} onChange={() => set('corners', c)} className="accent-[#14213D]" />
                <span className="h-9 w-14 border border-ink/40 bg-paper" style={{ borderRadius: cornerValues(c)['--radius-2xl'] }} aria-hidden="true" />
                <span className="text-sm text-ink">{CORNER_LABELS[c]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-ink">Main buttons</legend>
            {BUTTON_STYLES.map((b) => (
              <label key={b} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 ${draft.buttons === b ? 'border-ink bg-tint' : 'border-line'}`}>
                <input type="radio" name="buttons" checked={draft.buttons === b} onChange={() => set('buttons', b)} className="accent-[#14213D]" />
                <span className="inline-flex h-9 w-24 items-center justify-center bg-gold text-xs font-semibold text-ink" style={{ borderRadius: buttonRadius(b) }} aria-hidden="true">Add to cart</span>
                <span className="text-sm text-ink">{BUTTON_LABELS[b]}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-field p-4" style={previewVars} aria-label="Corner and button preview">
          <div className="h-20 w-32 border border-line bg-paper p-3 text-xs text-ink" style={{ borderRadius: radii['--radius-3xl'] }}>A card</div>
          <span className="inline-flex h-11 items-center bg-gold px-6 text-sm font-semibold text-ink" style={{ borderRadius: buttonRadius(draft.buttons) }}>Add to cart</span>
        </div>
        <p className="text-2xs text-ink/55">Round icon buttons, badges and the admin area keep their own shapes.</p>
      </section>

      <section className={card} aria-labelledby="favicon">
        <h2 id="favicon" className={sectionTitle}>Browser-tab icon (favicon)</h2>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-line bg-field text-2xs text-ink/50">
            {draft.faviconMediaId ? <img src={`/api/media/${encodeURIComponent(draft.faviconMediaId)}/image?w=128`} alt="Chosen icon" className="h-full w-full object-contain" /> : 'Default'}
          </span>
          <div className="space-x-2">
            <button type="button" onClick={() => setPickerOpen(true)} className="rounded-xl bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-deep">{draft.faviconMediaId ? 'Change image' : 'Choose image'}</button>
            {draft.faviconMediaId && <button type="button" onClick={() => set('faviconMediaId', null)} className="rounded-xl border border-line px-3 py-2 text-xs text-ink">Use the default icon</button>}
          </div>
        </div>
        <p className="text-2xs text-ink/55">Use a square image, at least 180 × 180 pixels (PNG works well). Upload it first in Media Assets.</p>
      </section>

      <section className={card} aria-labelledby="welcome">
        <h2 id="welcome" className={sectionTitle}>Loading animation</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-0.5 accent-[#14213D]" checked={draft.welcomeAnimation} onChange={(e) => set('welcomeAnimation', e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-ink">Show the animated logo when the shop first opens</span>
            <span className="text-2xs text-ink/60">Plays for about two seconds, once per visit, and never for search engines. The small loading animation shown while a page is on its way always stays.</span>
          </span>
        </label>
      </section>

      <section className={card} aria-labelledby="product-sections">
        <h2 id="product-sections" className={sectionTitle}>Product page sections</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PRODUCT_PAGE_SECTIONS.map((s) => (
            <li key={s.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" className="mt-0.5 accent-[#14213D]" checked={draft.productPage[s.key]} onChange={(e) => set('productPage', { ...draft.productPage, [s.key]: e.target.checked })} />
                <span><span className="block text-sm font-semibold text-ink">{s.label}</span><span className="text-2xs text-ink/60">{s.hint}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-2xs text-ink/55">The photo preview, size choices and Add to cart always show.</p>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:left-64">
        {dirty && <span className="mr-auto text-xs text-ink/60">You have unsaved changes.</span>}
        <button type="button" disabled={!dirty || busy} onClick={() => setDraft(saved)} className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-field disabled:opacity-40">Discard</button>
        <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="rounded-xl bg-gold px-5 py-2 text-xs font-bold text-ink hover:bg-gold-deep disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
      </div>

      <MediaPickerModal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} allowedTypes={['image']} title="Choose the browser-tab icon" onSelect={(asset) => { set('faviconMediaId', asset.id); setPickerOpen(false); }} />
    </div>
  );
}
