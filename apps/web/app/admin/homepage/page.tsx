'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { isSafeHref, type HomepageSection, type HomepageSectionType } from '@bro-pics/shared';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';

type Slide = NonNullable<HomepageSection['heroSlides']>[number];
type Step = NonNullable<HomepageSection['steps']>[number];

/** What each section is, in the words a shop owner uses, and which fields it actually shows. */
const SECTION_INFO: Record<HomepageSectionType, { label: string; desc: string; subtitle?: boolean; link?: boolean; image?: boolean }> = {
  hero_slider: { label: 'Hero banner', desc: 'The big sliding banner at the top' },
  category_tiles: { label: 'Shop by category', desc: 'Tiles for each main category' },
  best_sellers: { label: 'Best sellers', desc: 'Top-selling frames', subtitle: true, link: true },
  how_it_works: { label: 'How it works', desc: 'The steps from photo to doorstep', subtitle: true },
  featured_collection: { label: 'Featured collection', desc: 'A row of products from one category', link: true },
  products_in_motion: { label: 'Why us videos', desc: 'Reels from the video library', subtitle: true },
  reviews_testimonials: { label: 'Customer reviews', desc: 'Approved reviews from buyers' },
  why_us: { label: 'Why choose us', desc: 'Reasons to buy, with a picture', subtitle: true, image: true },
  offer_strip: { label: 'Offer banner', desc: 'A wide promotional banner', subtitle: true, link: true, image: true },
  recently_viewed: { label: 'Recently viewed', desc: 'Products the visitor looked at' },
};

const input = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink outline-none focus:border-ink';
const label = 'text-2xs font-semibold uppercase tracking-wide text-ink/55';

interface Draft {
  title: string;
  subtitle: string;
  link: string;
  image: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  heroSlides: Slide[];
  steps: Step[];
  valueProps: string[];
  categoryId: string;
}

const toLocal = (d: unknown) => {
  if (!d) return '';
  const date = new Date(typeof d === 'object' && d && '_seconds' in d ? (d as { _seconds: number })._seconds * 1000 : (d as string));
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function draftFrom(s: HomepageSection): Draft {
  return {
    title: s.title ?? '',
    subtitle: s.subtitle ?? '',
    link: s.link ?? '',
    image: s.image ?? '',
    isActive: s.isActive,
    startsAt: toLocal(s.startsAt),
    endsAt: toLocal(s.endsAt),
    heroSlides: [...(s.heroSlides ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    steps: s.steps ?? [],
    valueProps: s.valueProps ?? [],
    categoryId: typeof s.config?.categoryId === 'string' ? s.config.categoryId : '',
  };
}

/** Problems that would stop a save, in plain words. */
function problemsOf(type: HomepageSectionType, d: Draft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('Add a title.');
  const badLink = (l: string) => l.trim() !== '' && !isSafeHref(l);
  if (badLink(d.link)) out.push('The link must be a page on this shop (starting with /) or an https:// address.');
  if (type === 'hero_slider') {
    d.heroSlides.forEach((s, i) => {
      if (!s.title.trim()) out.push(`Slide ${i + 1} needs a headline.`);
      if (!s.image) out.push(`Slide ${i + 1} needs a picture.`);
      if (s.ctaLink && badLink(s.ctaLink)) out.push(`Slide ${i + 1}'s button link must start with / or https://.`);
    });
  }
  if (type === 'how_it_works') d.steps.forEach((s, i) => !s.label.trim() && out.push(`Step ${i + 1} needs a name.`));
  if (type === 'why_us') d.valueProps.forEach((v, i) => !v.trim() && out.push(`Reason ${i + 1} is empty.`));
  if (d.startsAt && d.endsAt && d.startsAt > d.endsAt) out.push('The end time is before the start time.');
  return out;
}

function ImageField({ value, onPick, onClear, hint }: { value: string; onPick: () => void; onClear?: () => void; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-field">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xs text-ink/40">No picture</span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex gap-2">
          <button type="button" onClick={onPick} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink">
            {value ? 'Change' : 'Choose picture'}
          </button>
          {value && onClear && (
            <button type="button" onClick={onClear} className="rounded-lg px-2 py-1.5 text-xs text-ink/60 underline">
              Remove
            </button>
          )}
        </div>
        {hint && <p className="text-2xs text-ink/50">{hint}</p>}
      </div>
    </div>
  );
}

function moveItem<T>(list: T[], i: number, d: number): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x);
  return next;
}

function RowTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: number) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} className="h-7 w-7 rounded border border-line text-xs disabled:opacity-30">
        ↑
      </button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)} className="h-7 w-7 rounded border border-line text-xs disabled:opacity-30">
        ↓
      </button>
      <button type="button" onClick={onRemove} className="h-7 rounded border border-line px-2 text-2xs text-alert">
        Remove
      </button>
    </div>
  );
}

export default function AdminHomepagePage() {
  const api = useAdminApi();
  const [sections, setSections] = useState<HomepageSection[] | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useState<HomepageSection | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picker, setPicker] = useState<null | { field: 'image' } | { field: 'slide'; index: number; which: 'image' | 'mobileImage' }>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ sections: HomepageSection[] }>('/api/admin/homepage-sections');
      setSections([...res.sections].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setSections([]);
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'The homepage could not be loaded.' });
    }
  }, [api]);
  useEffect(() => {
    void load();
    api<{ categories: Array<{ id: string; name: string }> }>('/api/admin/categories')
      .then((r) => setCategories(r.categories ?? []))
      .catch(() => setCategories([]));
  }, [load, api]);

  const notify = (ok: boolean, text: string) => setMessage({ ok, text });

  const move = async (index: number, d: number) => {
    if (!sections) return;
    const next = moveItem(sections, index, d);
    setSections(next);
    try {
      await api('/api/admin/homepage-sections/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: next.map((s) => s.id) }) });
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'The new order could not be saved.');
      void load();
    }
  };

  const toggle = async (s: HomepageSection) => {
    try {
      await api(`/api/admin/homepage-sections/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) });
      notify(true, `${SECTION_INFO[s.type].label} is now ${s.isActive ? 'hidden' : 'shown'} on the homepage.`);
      void load();
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'That change could not be saved.');
    }
  };

  const addSection = async (type: HomepageSectionType) => {
    setAdding(false);
    try {
      const res = await api<{ section: HomepageSection }>('/api/admin/homepage-sections', {
        method: 'POST',
        body: JSON.stringify({ type, title: SECTION_INFO[type].label, isActive: false, sortOrder: sections?.length ?? 0 }),
      });
      await load();
      setEditing(res.section);
      setDraft(draftFrom(res.section));
      notify(true, `${SECTION_INFO[type].label} added (hidden until you show it).`);
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'The section could not be added.');
    }
  };

  const open = (s: HomepageSection) => {
    setEditing(s);
    setDraft(draftFrom(s));
  };

  const save = async () => {
    if (!editing || !draft) return;
    setBusy(true);
    try {
      const info = SECTION_INFO[editing.type];
      const body: Record<string, unknown> = {
        title: draft.title.trim(),
        isActive: draft.isActive,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      };
      if (info.subtitle) body.subtitle = draft.subtitle.trim();
      if (info.link) body.link = draft.link.trim();
      if (info.image) body.image = draft.image;
      if (editing.type === 'hero_slider') {
        body.heroSlides = draft.heroSlides.map((s, i) => ({
          ...s,
          sortOrder: i,
          eyebrow: s.eyebrow?.trim() || undefined,
          subtitle: s.subtitle?.trim() || undefined,
          ctaLabel: s.ctaLabel?.trim() || undefined,
          ctaLink: s.ctaLink?.trim() || undefined,
          mobileImage: s.mobileImage || s.image,
        }));
      }
      if (editing.type === 'how_it_works') body.steps = draft.steps.map((s) => ({ label: s.label.trim(), desc: s.desc.trim() }));
      if (editing.type === 'why_us') body.valueProps = draft.valueProps.map((v) => v.trim());
      if (editing.type === 'featured_collection') body.config = { ...editing.config, categoryId: draft.categoryId || undefined };
      await api(`/api/admin/homepage-sections/${editing.id}`, { method: 'PATCH', body: JSON.stringify(JSON.parse(JSON.stringify(body))) });
      notify(true, `${info.label} saved. The homepage shows it now.`);
      setEditing(null);
      void load();
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'The section could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const problems = editing && draft ? problemsOf(editing.type, draft) : [];
  const setSlide = (i: number, patch: Partial<Slide>) => draft && setDraft({ ...draft, heroSlides: draft.heroSlides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Homepage</h1>
          <p className="text-xs text-ink/60">Choose which sections show, in what order, and what each one says.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/" target="_blank" className="rounded-xl border border-line bg-paper px-3.5 py-2 text-xs font-semibold text-ink hover:bg-field">
            View homepage ↗
          </Link>
          <button type="button" onClick={() => setAdding((v) => !v)} className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink hover:bg-gold-deep">
            Add section
          </button>
        </div>
      </div>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>
          {message.text}
        </p>
      )}

      {adding && (
        <div className="grid gap-2 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-2">
          {(Object.keys(SECTION_INFO) as HomepageSectionType[]).map((type) => (
            <button key={type} type="button" onClick={() => void addSection(type)} className="rounded-xl border border-line p-3 text-left hover:border-ink">
              <span className="block text-sm font-semibold text-ink">{SECTION_INFO[type].label}</span>
              <span className="block text-2xs text-ink/60">{SECTION_INFO[type].desc}</span>
            </button>
          ))}
        </div>
      )}

      <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
        {sections === null ? (
          <li className="h-40 animate-pulse bg-field" />
        ) : sections.length === 0 ? (
          <li className="p-10 text-center text-sm text-ink/60">No sections yet. Use “Add section” to build the homepage.</li>
        ) : (
          sections.map((s, i) => (
            <li key={`${s.id}-${i}`} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${s.isActive ? '' : 'bg-field/40'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex flex-col">
                  <button type="button" aria-label={`Move ${SECTION_INFO[s.type].label} up`} disabled={i === 0} onClick={() => void move(i, -1)} className="px-1 text-xs text-ink/50 hover:text-ink disabled:opacity-20">
                    ▲
                  </button>
                  <button type="button" aria-label={`Move ${SECTION_INFO[s.type].label} down`} disabled={i === sections.length - 1} onClick={() => void move(i, 1)} className="px-1 text-xs text-ink/50 hover:text-ink disabled:opacity-20">
                    ▼
                  </button>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{SECTION_INFO[s.type].label}</span>
                    <StatusChip status={s.isActive ? 'published' : 'draft'} size="sm" />
                  </div>
                  <p className="truncate text-2xs text-ink/60">“{s.title}” · {SECTION_INFO[s.type].desc}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void toggle(s)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                  {s.isActive ? 'Hide' : 'Show'}
                </button>
                <button type="button" onClick={() => open(s)} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-ink hover:bg-gold-deep">
                  Edit
                </button>
              </div>
            </li>
          ))
        )}
      </ol>

      <AdminDrawer isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `Edit ${SECTION_INFO[editing.type].label}` : ''} subtitle={editing ? SECTION_INFO[editing.type].desc : undefined} width="lg">
        {editing && draft && (
          <div className="space-y-5 text-sm">
            <label className="block space-y-1">
              <span className={label}>{editing.type === 'hero_slider' ? 'Name (for your reference)' : 'Heading'}</span>
              <input value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={input} />
            </label>
            {SECTION_INFO[editing.type].subtitle && (
              <label className="block space-y-1">
                <span className={label}>Line under the heading</span>
                <input value={draft.subtitle} maxLength={200} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} className={input} />
              </label>
            )}
            {SECTION_INFO[editing.type].link && (
              <label className="block space-y-1">
                <span className={label}>{editing.type === 'offer_strip' ? 'Where the banner goes' : '“View all” link'}</span>
                <input value={draft.link} placeholder="/category/frames-wall-decor" onChange={(e) => setDraft({ ...draft, link: e.target.value })} className={input} />
              </label>
            )}
            {SECTION_INFO[editing.type].image && (
              <div className="space-y-1">
                <span className={label}>Picture</span>
                <ImageField value={draft.image} onPick={() => setPicker({ field: 'image' })} onClear={() => setDraft({ ...draft, image: '' })} />
              </div>
            )}

            {editing.type === 'featured_collection' && (
              <label className="block space-y-1">
                <span className={label}>Category to feature</span>
                <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className={input}>
                  <option value="">The first category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {editing.type === 'hero_slider' && (
              <div className="space-y-3">
                <span className={label}>Slides</span>
                {draft.heroSlides.map((s, i) => (
                  <fieldset key={s.id} className="space-y-2 rounded-xl border border-line p-3">
                    <legend className="flex w-full items-center justify-between gap-2 px-1">
                      <span className="text-xs font-semibold text-ink">Slide {i + 1}</span>
                      <RowTools i={i} n={draft.heroSlides.length} onMove={(d) => setDraft({ ...draft, heroSlides: moveItem(draft.heroSlides, i, d) })} onRemove={() => setDraft({ ...draft, heroSlides: draft.heroSlides.filter((_, j) => j !== i) })} />
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label={`Slide ${i + 1} small heading`} placeholder="Small heading (e.g. More than frames)" value={s.eyebrow ?? ''} onChange={(e) => setSlide(i, { eyebrow: e.target.value })} className={input} />
                      <input aria-label={`Slide ${i + 1} headline`} placeholder="Headline" value={s.title} onChange={(e) => setSlide(i, { title: e.target.value })} className={input} />
                    </div>
                    <input aria-label={`Slide ${i + 1} text`} placeholder="Text under the headline" value={s.subtitle ?? ''} onChange={(e) => setSlide(i, { subtitle: e.target.value })} className={input} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label={`Slide ${i + 1} button label`} placeholder="Button label (e.g. Find your frame)" value={s.ctaLabel ?? ''} onChange={(e) => setSlide(i, { ctaLabel: e.target.value })} className={input} />
                      <input aria-label={`Slide ${i + 1} button link`} placeholder="/category" value={s.ctaLink ?? ''} onChange={(e) => setSlide(i, { ctaLink: e.target.value })} className={input} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ImageField value={s.image} onPick={() => setPicker({ field: 'slide', index: i, which: 'image' })} hint="Wide picture for computers" />
                      <ImageField value={s.mobileImage === s.image ? '' : s.mobileImage} onPick={() => setPicker({ field: 'slide', index: i, which: 'mobileImage' })} onClear={() => setSlide(i, { mobileImage: s.image })} hint="Optional tall picture for phones" />
                    </div>
                  </fieldset>
                ))}
                {draft.heroSlides.length < 8 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        heroSlides: [...draft.heroSlides, { id: `slide-${Date.now().toString(36)}`, title: '', image: '', mobileImage: '', sortOrder: draft.heroSlides.length }],
                      })
                    }
                    className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink hover:text-ink"
                  >
                    Add slide
                  </button>
                )}
              </div>
            )}

            {editing.type === 'how_it_works' && (
              <div className="space-y-2">
                <span className={label}>Steps</span>
                {draft.steps.map((s, i) => (
                  <div key={i} className="space-y-1.5 rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">Step {i + 1}</span>
                      <RowTools i={i} n={draft.steps.length} onMove={(d) => setDraft({ ...draft, steps: moveItem(draft.steps, i, d) })} onRemove={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} />
                    </div>
                    <input aria-label={`Step ${i + 1} name`} value={s.label} placeholder="Upload your photo" onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={input} />
                    <input aria-label={`Step ${i + 1} description`} value={s.desc} placeholder="Short explanation" onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} className={input} />
                  </div>
                ))}
                {draft.steps.length < 6 && (
                  <button type="button" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { label: '', desc: '' }] })} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink hover:text-ink">
                    Add step
                  </button>
                )}
                {draft.steps.length === 0 && <p className="text-2xs text-ink/50">With no steps, the shop shows its standard three steps.</p>}
              </div>
            )}

            {editing.type === 'why_us' && (
              <div className="space-y-2">
                <span className={label}>Reasons to choose you</span>
                {draft.valueProps.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input aria-label={`Reason ${i + 1}`} value={v} maxLength={120} onChange={(e) => setDraft({ ...draft, valueProps: draft.valueProps.map((x, j) => (j === i ? e.target.value : x)) })} className={input} />
                    <RowTools i={i} n={draft.valueProps.length} onMove={(d) => setDraft({ ...draft, valueProps: moveItem(draft.valueProps, i, d) })} onRemove={() => setDraft({ ...draft, valueProps: draft.valueProps.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {draft.valueProps.length < 8 && (
                  <button type="button" onClick={() => setDraft({ ...draft, valueProps: [...draft.valueProps, ''] })} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink hover:text-ink">
                    Add reason
                  </button>
                )}
              </div>
            )}

            <fieldset className="space-y-2 border-t border-line pt-4">
              <legend className={label}>Show only between (optional)</legend>
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" aria-label="Show from" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className={input} />
                <input type="datetime-local" aria-label="Show until" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} className={input} />
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-[#14213D]" />
              Show this section on the homepage
            </label>

            {problems.length > 0 && (
              <ul role="alert" className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-line px-4 py-2 text-xs font-semibold">
                Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={busy || problems.length > 0} className="rounded-xl bg-gold px-5 py-2 text-xs font-bold text-ink hover:bg-gold-deep disabled:opacity-50">
                {busy ? 'Saving…' : 'Save & publish'}
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      <MediaPickerModal
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        allowedTypes={['image']}
        onSelect={(asset) => {
          if (!draft || !picker) return;
          // Banners show large: ask the image route for a bigger version.
          const url = asset.url.replace(/([?&]w=)\d+/, '$12000');
          if (picker.field === 'image') setDraft({ ...draft, image: url });
          else
            setDraft({
              ...draft,
              heroSlides: draft.heroSlides.map((s, j) =>
                j === picker.index ? { ...s, [picker.which]: url, ...(picker.which === 'image' && (!s.mobileImage || s.mobileImage === s.image) && { mobileImage: url }) } : s
              ),
            });
          setPicker(null);
        }}
      />
    </div>
  );
}
