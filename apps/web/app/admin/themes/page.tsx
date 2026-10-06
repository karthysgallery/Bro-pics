'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  THEME_EFFECTS,
  THEME_GARLANDS,
  THEME_GREETING_ART,
  THEME_HANGINGS,
  THEME_MOTIFS,
  THEME_PRESETS,
  ThemeSettingsSchema,
  defaultThemeSettings,
  indiaDate,
  resolveActiveTheme,
  themeCssVariables,
  themeReadabilityIssues,
  upgradeThemeSettings,
  type StoreTheme,
  type ThemeColors,
  type ThemeSettings,
} from '@bro-pics/shared';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';
import { FestiveBand } from '../../../components/theme/FestiveBand';
import { FestiveGarland } from '../../../components/theme/FestiveGarland';

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'field', label: 'Page background' },
  { key: 'paper', label: 'Cards' },
  { key: 'tint', label: 'Soft bands' },
  { key: 'line', label: 'Borders' },
  { key: 'ink', label: 'Text' },
  { key: 'gold', label: 'Main buttons' },
  { key: 'goldDeep', label: 'Buttons (pressed)' },
  { key: 'accent', label: 'Links & accents' },
  { key: 'accentDark', label: 'Accent (dark)' },
];

const MOTIF_LABEL: Record<(typeof THEME_MOTIFS)[number], string> = {
  none: 'No ornament band',
  diya: 'Diyas',
  kolam: 'Kolam',
  star: 'Stars',
  sparkle: 'Sparkles',
  sugarcane: 'Sugarcane',
};
const EFFECT_LABEL: Record<(typeof THEME_EFFECTS)[number], string> = {
  none: 'No animation',
  sparkles: 'Twinkling sparkles',
  snow: 'Gentle snow',
  petals: 'Falling petals',
  confetti: 'Confetti',
  lanterns: 'Floating sky lanterns',
  fireworks: 'Fireworks',
  colors: 'Holi colours',
  hearts: 'Floating hearts',
};
const GARLAND_LABEL: Record<(typeof THEME_GARLANDS)[number], string> = {
  none: 'No garland',
  marigold: 'Marigold garland',
  thoranam: 'Mango-leaf thoranam',
  'string-lights': 'Twinkling string lights',
  bunting: 'Party bunting',
  'diya-row': 'Row of lit diyas',
  tricolor: 'Tricolour pennants',
  hearts: 'Heart garland',
};
const HANGING_LABEL: Record<(typeof THEME_HANGINGS)[number], string> = {
  none: 'Nothing hanging',
  lanterns: 'Akash kandil lanterns',
  baubles: 'Christmas baubles',
  stars: 'Golden stars',
  bells: 'Bells',
  hearts: 'Hearts',
  crescents: 'Crescent moons & stars',
};
const ART_LABEL: Record<(typeof THEME_GREETING_ART)[number], string> = {
  none: 'No picture',
  rangoli: 'Rangoli with diya',
  'pongal-pot': 'Pongal pot',
  tree: 'Christmas tree',
  fireworks: 'Fireworks',
  holi: 'Holi colours',
  dandiya: 'Dandiya sticks',
  lamps: 'Agal vilakku lamps',
  modak: 'Modaks',
  pookalam: 'Onam pookalam',
  rakhi: 'Rakhi',
  crescent: 'Crescent moon',
  flag: 'Indian flag',
  heart: 'Heart',
  frame: 'Family photo frame',
  kolam: 'Kolam',
  peacock: 'Peacock feather',
};

const NATIONAL = new Set(['independence-day', 'republic-day']);
const SPECIAL_DAYS = new Set(['valentines-day', 'mothers-day', 'fathers-day', 'new-year']);
type Filter = 'all' | 'scheduled' | 'festivals' | 'national' | 'special' | 'own';
const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['scheduled', 'On or scheduled'],
  ['festivals', 'Festivals'],
  ['national', 'National days'],
  ['special', 'Special days'],
  ['own', 'Your own'],
];

const formatDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** A small storefront drawn in the theme's own colours, so the admin sees the look before turning it on. */
function ThemePreview({ theme }: { theme: StoreTheme }) {
  const style = themeCssVariables(theme.colors) as unknown as CSSProperties;
  return (
    <div style={style} className="overflow-hidden rounded-xl border border-line bg-field text-ink" aria-hidden="true">
      <div className="truncate bg-ink px-3 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-paper">
        {theme.decor.bannerText || 'Made for your memories'}
      </div>
      <div className="flex items-center justify-between bg-paper px-3 py-2">
        <span className="text-[11px] font-bold">
          Karthys<span className="text-gold">Gallery</span>
        </span>
        <span className="h-3 w-14 rounded-full bg-tint" />
      </div>
      {theme.decor.garland !== 'none' ? (
        <div className="h-6 overflow-hidden">
          <div className="origin-top scale-[0.6]" style={{ width: '166%', marginLeft: '-33%' }}>
            <FestiveGarland garland={theme.decor.garland} overlay={false} />
          </div>
        </div>
      ) : (
        <div className="scale-y-75">
          <FestiveBand motif={theme.decor.motif} />
        </div>
      )}
      <div className="grid grid-cols-[1.2fr_1fr] gap-2 p-3">
        <div className="space-y-1.5">
          <div className="text-[13px] font-bold leading-tight">{theme.decor.greeting?.title ?? 'Every memory deserves a frame'}</div>
          <div className="line-clamp-2 text-[9px] text-ink/60">{theme.decor.greeting?.subtitle ?? 'Personalised frames, made in India'}</div>
          <div className="flex gap-1.5 pt-1">
            <span className="rounded-full bg-gold px-2.5 py-1 text-[9px] font-semibold text-ink">Find your frame</span>
            <span className="rounded-full border border-line bg-paper px-2 py-1 text-[9px] text-accent">How it works</span>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-1.5">
          <div className="aspect-[4/3] rounded bg-tint" />
          <div className="mt-1 text-[8px] font-semibold">Classic frame</div>
          <div className="text-[8px] text-accent">₹799</div>
        </div>
      </div>
    </div>
  );
}

export default function FestivalThemesPage() {
  const api = useAdminApi();
  const [saved, setSaved] = useState<ThemeSettings | null>(null);
  const [draft, setDraft] = useState<ThemeSettings | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ value: unknown }>('/api/admin/settings/theme');
      const parsed = ThemeSettingsSchema.safeParse(upgradeThemeSettings(res.value));
      const value = parsed.success ? parsed.data : defaultThemeSettings();
      setSaved(value);
      setDraft(value);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Themes could not be loaded.' });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const validation = useMemo(() => (draft ? ThemeSettingsSchema.safeParse(draft) : null), [draft]);

  if (!draft || !saved) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6 md:p-8">
        {message ? <p className="text-sm text-alert">{message.text}</p> : <div className="h-96 animate-pulse rounded-2xl bg-field" />}
      </div>
    );
  }

  const liveNow = resolveActiveTheme(saved);
  const previewNow = resolveActiveTheme(draft);
  const today = indiaDate(new Date());

  const updateTheme = (id: string, patch: Partial<StoreTheme>) =>
    setDraft((d) => (d ? { ...d, themes: d.themes.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d));

  const save = async () => {
    if (!validation?.success) return;
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/admin/settings/theme', { method: 'PUT', body: JSON.stringify(draft) });
      setSaved(draft);
      const showing = resolveActiveTheme(draft);
      setMessage({ ok: true, text: `Saved. The shop now shows the ${showing.name} theme.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'The themes could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  const addCustom = () => {
    const base = draft.themes.find((t) => t.id === editingId) ?? draft.themes[0];
    let n = 1;
    while (draft.themes.some((t) => t.id === `custom-${n}`)) n++;
    const theme: StoreTheme = { ...base, id: `custom-${n}`, name: `${base.name} copy`, schedule: null, colors: { ...base.colors }, decor: { ...base.decor } };
    setDraft({ ...draft, themes: [...draft.themes, theme] });
    setEditingId(theme.id);
  };

  const editing = draft.themes.find((t) => t.id === editingId) ?? null;
  const preset = editing ? THEME_PRESETS.find((p) => p.id === editing.id) : undefined;
  const readability = editing ? themeReadabilityIssues(editing.colors) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pb-28 md:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Festival themes</h1>
          <p className="text-xs text-ink/60">
            Repaint the shop for Diwali, Pongal, Christmas, New Year or your own occasion. Turn a theme on now, or give it dates and the shop switches by itself.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper px-4 py-2.5 text-xs">
          <span className="text-ink/60">Live on the shop: </span>
          <strong className="font-semibold text-ink">{liveNow.name}</strong>
          {liveNow.schedule && saved.mode === 'schedule' && (
            <span className="text-ink/60">
              {' '}
              until {formatDate(liveNow.schedule.end)}
            </span>
          )}
        </div>
      </div>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>
          {message.text}
        </p>
      )}

      <fieldset className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper p-4">
        <legend className="sr-only">How the theme is chosen</legend>
        {(
          [
            ['schedule', 'Follow the calendar', 'A theme turns on during its dates; otherwise the theme marked "default" below shows.'],
            ['manual', 'Keep one theme on', 'The chosen theme stays until you change it, whatever the dates.'],
          ] as const
        ).map(([mode, label, hint]) => (
          <label key={mode} className={`flex min-w-[240px] flex-1 cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${draft.mode === mode ? 'border-ink bg-tint' : 'border-line'}`}>
            <input type="radio" name="theme-mode" checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} className="mt-0.5 accent-[#14213D]" />
            <span>
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-xs text-ink/60">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div role="group" aria-label="Show themes" className="flex flex-wrap gap-2">
        {FILTERS.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`h-8 rounded-full border px-3.5 text-xs font-semibold ${filter === id ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink/70 hover:border-ink/50'}`}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {draft.themes
          .filter((t) => {
            const isPreset = THEME_PRESETS.some((p) => p.id === t.id);
            if (filter === 'all') return true;
            if (filter === 'scheduled') return Boolean(t.schedule) || t.id === previewNow.id;
            if (filter === 'own') return !isPreset;
            if (filter === 'national') return NATIONAL.has(t.id);
            if (filter === 'special') return SPECIAL_DAYS.has(t.id);
            return isPreset && t.id !== 'default' && !NATIONAL.has(t.id) && !SPECIAL_DAYS.has(t.id);
          })
          .map((t) => {
          const showing = previewNow.id === t.id;
          const isChosen = draft.activeThemeId === t.id;
          const upcoming = t.schedule && t.schedule.end >= today;
          return (
            <article key={t.id} className={`space-y-3 rounded-2xl border bg-paper p-3 ${showing ? 'border-ink ring-2 ring-ink/10' : 'border-line'}`}>
              <ThemePreview theme={t} />
              <div className="flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{t.name}</h2>
                  <p className="text-2xs text-ink/55">
                    {t.decor.garland !== 'none' ? GARLAND_LABEL[t.decor.garland] : MOTIF_LABEL[t.decor.motif]} · {EFFECT_LABEL[t.decor.effect]}
                    {t.decor.hanging !== 'none' && ` · ${HANGING_LABEL[t.decor.hanging]}`}
                  </p>
                </div>
                {showing && <span className="rounded-full bg-ink px-2 py-0.5 text-2xs font-semibold text-paper">Showing</span>}
              </div>

              <div className="space-y-1.5 px-1">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Dates</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    aria-label={`${t.name} start date`}
                    value={t.schedule?.start ?? ''}
                    onChange={(e) =>
                      updateTheme(t.id, { schedule: e.target.value ? { start: e.target.value, end: t.schedule?.end && t.schedule.end >= e.target.value ? t.schedule.end : e.target.value } : null })
                    }
                    className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                  />
                  <span className="text-xs text-ink/40">to</span>
                  <input
                    type="date"
                    aria-label={`${t.name} end date`}
                    value={t.schedule?.end ?? ''}
                    min={t.schedule?.start}
                    disabled={!t.schedule}
                    onChange={(e) => t.schedule && updateTheme(t.id, { schedule: { start: t.schedule.start, end: e.target.value || t.schedule.start } })}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs text-ink disabled:opacity-50"
                  />
                  {t.schedule && (
                    <button type="button" onClick={() => updateTheme(t.id, { schedule: null })} className="text-2xs font-semibold text-ink/60 underline">
                      Clear
                    </button>
                  )}
                </div>
                {t.schedule && !upcoming && <p className="text-2xs text-alert">These dates have passed. Set this year&apos;s dates.</p>}
              </div>

              <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, mode: 'manual', activeThemeId: t.id })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${draft.mode === 'manual' && isChosen ? 'bg-ink text-paper' : 'bg-gold text-ink hover:bg-gold-deep'}`}
                >
                  {draft.mode === 'manual' && isChosen ? 'On now' : 'Turn on now'}
                </button>
                {draft.mode === 'schedule' && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, activeThemeId: t.id })}
                    disabled={isChosen}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
                  >
                    {isChosen ? 'Default between festivals' : 'Use between festivals'}
                  </button>
                )}
                <button type="button" onClick={() => setEditingId(editingId === t.id ? null : t.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                  {editingId === t.id ? 'Close editor' : 'Edit look'}
                </button>
              </div>
            </article>
          );
        })}
        <button
          type="button"
          onClick={addCustom}
          className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-ink/60 hover:border-ink hover:text-ink"
        >
          Add your own theme
        </button>
      </div>

      {editing && (
        <section aria-labelledby="edit-theme" className="grid gap-6 rounded-2xl border border-line bg-paper p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="edit-theme" className="font-display text-lg font-bold text-ink">
                Edit {editing.name}
              </h2>
              <div className="flex gap-2">
                {preset && (
                  <button type="button" onClick={() => updateTheme(editing.id, { colors: { ...preset.colors }, decor: { ...preset.decor } })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                    Reset to original
                  </button>
                )}
                {!preset && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, activeThemeId: draft.activeThemeId === editing.id ? 'default' : draft.activeThemeId, themes: draft.themes.filter((t) => t.id !== editing.id) });
                      setEditingId(null);
                    }}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-alert"
                  >
                    Delete theme
                  </button>
                )}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Name</span>
              <input value={editing.name} maxLength={40} onChange={(e) => updateTheme(editing.id, { name: e.target.value })} className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink" />
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                  <input
                    type="color"
                    value={editing.colors[key]}
                    onChange={(e) => updateTheme(editing.id, { colors: { ...editing.colors, [key]: e.target.value.toUpperCase() } })}
                    className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-ink">{label}</span>
                    <span className="block font-mono text-2xs text-ink/50">{editing.colors[key]}</span>
                  </span>
                </label>
              ))}
            </div>
            {readability.length > 0 ? (
              <ul role="alert" className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {readability.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700">All text stays easy to read with these colours.</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['garland', 'Garland under the header', THEME_GARLANDS, GARLAND_LABEL],
                  ['hanging', 'Hanging at the sides (large screens)', THEME_HANGINGS, HANGING_LABEL],
                  ['effect', 'Moving effect', THEME_EFFECTS, EFFECT_LABEL],
                  ['motif', 'Thin pattern band (when no garland)', THEME_MOTIFS, MOTIF_LABEL],
                ] as const
              ).map(([field, label, options, labels]) => (
                <label key={field} className="block space-y-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{label}</span>
                  <select
                    value={editing.decor[field]}
                    onChange={(e) => updateTheme(editing.id, { decor: { ...editing.decor, [field]: e.target.value } })}
                    className="h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink"
                  >
                    {options.map((m) => (
                      <option key={m} value={m}>
                        {(labels as Record<string, string>)[m]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <fieldset className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 text-2xs font-semibold uppercase tracking-wide text-ink/55">Homepage greeting</legend>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={Boolean(editing.decor.greeting)}
                  onChange={(e) =>
                    updateTheme(editing.id, {
                      decor: { ...editing.decor, greeting: e.target.checked ? preset?.decor.greeting ?? { title: `Happy ${editing.name}`, art: 'none' } : undefined },
                    })
                  }
                  className="h-4 w-4 accent-[#14213D]"
                />
                Show a festive greeting at the top of the homepage
              </label>
              {editing.decor.greeting && (
                <div className="space-y-2">
                  {(
                    [
                      ['title', 'Title', 60, 'Happy Diwali'],
                      ['subtitle', 'Message', 160, 'Gift the glow of a moment they love'],
                      ['ctaLabel', 'Button label', 30, 'Shop Diwali gifts'],
                      ['ctaHref', 'Button link', 300, '/category'],
                    ] as const
                  ).map(([field, label, max, placeholder]) => (
                    <label key={field} className="block space-y-1">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{label}</span>
                      <input
                        value={editing.decor.greeting?.[field] ?? ''}
                        maxLength={max}
                        placeholder={placeholder}
                        onChange={(e) =>
                          updateTheme(editing.id, {
                            decor: {
                              ...editing.decor,
                              greeting: { ...editing.decor.greeting!, [field]: field === 'title' ? e.target.value : e.target.value || undefined },
                            },
                          })
                        }
                        className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink"
                      />
                    </label>
                  ))}
                  <label className="block space-y-1">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Picture</span>
                    <select
                      value={editing.decor.greeting.art}
                      onChange={(e) => updateTheme(editing.id, { decor: { ...editing.decor, greeting: { ...editing.decor.greeting!, art: e.target.value as (typeof THEME_GREETING_ART)[number] } } })}
                      className="h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink"
                    >
                      {THEME_GREETING_ART.map((a) => (
                        <option key={a} value={a}>
                          {ART_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </fieldset>

            <label className="block space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Festive message in the top bar (optional)</span>
              <input
                value={editing.decor.bannerText ?? ''}
                maxLength={140}
                placeholder="e.g. Happy Diwali! 10% off with code DIWALI10"
                onChange={(e) => updateTheme(editing.id, { decor: { ...editing.decor, bannerText: e.target.value || undefined } })}
                className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Message link (optional)</span>
              <input
                value={editing.decor.bannerLink ?? ''}
                maxLength={300}
                placeholder="/category/festive-gifts"
                onChange={(e) => updateTheme(editing.id, { decor: { ...editing.decor, bannerLink: e.target.value || undefined } })}
                className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink"
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Preview</p>
            <ThemePreview theme={editing} />
            <p className="text-2xs text-ink/50">The admin area always keeps the everyday colours.</p>
          </div>
        </section>
      )}

      {(dirty || busy) && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-gold/20 bg-ink px-5 py-3 text-paper shadow-2xl">
          <span className="text-xs">
            {validation && !validation.success ? <span className="font-semibold text-red-300">{validation.error.issues[0]?.message}</span> : `Unsaved changes · shop will show ${previewNow.name}`}
          </span>
          <button type="button" onClick={() => setDraft(saved)} disabled={busy} className="rounded-xl px-3 py-1.5 text-xs text-paper/70 hover:bg-paper/10 hover:text-paper">
            Discard
          </button>
          <button type="button" onClick={save} disabled={busy || !validation?.success} className="rounded-xl bg-gold px-4 py-1.5 text-xs font-semibold text-ink hover:bg-gold-deep disabled:opacity-50">
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      )}
    </div>
  );
}
