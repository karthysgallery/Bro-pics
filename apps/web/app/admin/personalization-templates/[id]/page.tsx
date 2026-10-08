'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { validateTemplate, type PersonalizationTemplate } from '@bro-pics/shared';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { ConfirmModal } from '../../../../components/admin/AdminModal';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { TemplateStage, type SamplePhoto, type SpaceKind } from '../../../../components/admin/template-builder/TemplateStage';
import { CalendarSlotInspector, PhotoSlotInspector, TextSlotInspector } from '../../../../components/admin/template-builder/SlotInspector';
import { PhotoGridForm } from '../../../../components/admin/template-builder/PhotoGridForm';
import { ProductLinks } from '../../../../components/admin/template-builder/ProductLinks';
import {
  DETECTION_NOTES_KEY,
  addCalendarSlot,
  addPhotoGrid,
  addPhotoSlot,
  addTextSlot,
  artworkAbovePhotos,
  duplicatePhotoSlot,
  movePhotoSlot,
  removeSlot,
  setArtworkAbovePhotos,
  setPrintSize,
  updateCalendarSlot,
  updatePhotoSlot,
  updateTextSlot,
  type SlotPatch,
} from '../../../../components/admin/template-builder/template-draft';

interface BuilderPageProps {
  params: Promise<{ id: string }>;
}

interface DetectionNotes {
  notes: string[];
  warnings: string[];
  found: number;
  manual: boolean;
}

const card = 'space-y-3 rounded-2xl border border-line bg-paper p-4';
const smallButton = 'rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40';

export default function TemplateBuilderPage({ params }: BuilderPageProps) {
  const api = useAdminApi();
  const [id, setId] = useState('');
  const [versions, setVersions] = useState<PersonalizationTemplate[] | null>(null);
  const [saved, setSaved] = useState<PersonalizationTemplate | null>(null);
  const [draft, setDraft] = useState<PersonalizationTemplate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState<DetectionNotes | null>(null);
  const [samples, setSamples] = useState<Map<string, SamplePhoto>>(new Map());
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    Promise.resolve(params).then((p) => setId(p.id));
  }, [params]);

  const load = useCallback(
    async (preferVersion?: number) => {
      if (!id) return;
      try {
        const res = await api<{ versions: PersonalizationTemplate[] }>(`/api/admin/personalization-templates/${id}`);
        setVersions(res.versions);
        const pick = res.versions.find((v) => v.version === preferVersion) ?? res.versions[0];
        setSaved(pick ?? null);
        setDraft(pick ?? null);
      } catch (err) {
        setVersions([]);
        setMessage({ ok: false, text: err instanceof Error ? err.message : 'This template could not be loaded.' });
      }
    },
    [api, id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = sessionStorage.getItem(DETECTION_NOTES_KEY(id));
      if (raw) {
        setNotes(JSON.parse(raw) as DetectionNotes);
        sessionStorage.removeItem(DETECTION_NOTES_KEY(id));
      }
    } catch {
      // ignore
    }
  }, [id]);

  // Sample photos live only in this tab.
  useEffect(() => () => samples.forEach((s) => URL.revokeObjectURL(s.src)), [samples]);

  const editable = saved?.status === 'draft' || saved?.status === 'review';
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const validation = useMemo(() => (draft ? validateTemplate(draft) : null), [draft]);
  const errors = validation?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = validation?.issues.filter((i) => i.severity === 'warning') ?? [];
  const live = Boolean(versions?.some((v) => v.status === 'published'));

  const change = (fn: (t: PersonalizationTemplate) => PersonalizationTemplate) => setDraft((t) => (t && editable ? fn(t) : t));

  const onStageChange = (kind: SpaceKind, slotId: string, patch: SlotPatch) =>
    change((t) => (kind === 'photo' ? updatePhotoSlot(t, slotId, patch) : kind === 'text' ? updateTextSlot(t, slotId, patch) : updateCalendarSlot(t, slotId, patch)));

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'That did not work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    act('saving', async () => {
      if (!draft) return;
      const next = await api<PersonalizationTemplate>(`/api/admin/personalization-templates/${draft.id}/versions/${draft.version}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setSaved(next);
      setDraft(next);
      setMessage({ ok: true, text: 'Draft saved.' });
    });

  const publish = () =>
    act('publishing', async () => {
      if (!draft) return;
      if (dirty) {
        const next = await api<PersonalizationTemplate>(`/api/admin/personalization-templates/${draft.id}/versions/${draft.version}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
        setSaved(next);
      }
      await api(`/api/admin/personalization-templates/${draft.id}/versions/${draft.version}/status`, { method: 'POST', body: JSON.stringify({ to: 'published' }) });
      await load(draft.version);
      setMessage({ ok: true, text: `Version ${draft.version} is live. Products using this design now show it.` });
    });

  const newVersion = () =>
    act('versioning', async () => {
      if (!saved) return;
      const next = await api<PersonalizationTemplate>('/api/admin/personalization-templates', { method: 'POST', body: JSON.stringify({ ...saved, status: 'draft' }) });
      await load(next.version);
      setMessage({ ok: true, text: `Version ${next.version} created as a draft. The live version stays unchanged until you publish this one.` });
    });

  const archive = () =>
    act('archiving', async () => {
      if (!saved) return;
      await api(`/api/admin/personalization-templates/${saved.id}/versions/${saved.version}/status`, { method: 'POST', body: JSON.stringify({ to: 'archived' }) });
      setConfirmArchive(false);
      await load(saved.version);
      setMessage({ ok: true, text: `Version ${saved.version} archived.` });
    });

  const addSamples = async (files: FileList | null) => {
    if (!files || !draft) return;
    const next = new Map(samples);
    const empty = draft.photoSlots.filter((s) => !next.has(s.id));
    const chosen = Array.from(files).slice(0, empty.length || draft.photoSlots.length);
    const targets = empty.length > 0 ? empty : draft.photoSlots;
    await Promise.all(
      chosen.map(async (file, i) => {
        const src = URL.createObjectURL(file);
        const img = new Image();
        img.src = src;
        try {
          await img.decode();
          next.set(targets[i].id, { src, width: img.naturalWidth, height: img.naturalHeight });
        } catch {
          URL.revokeObjectURL(src);
        }
      })
    );
    setSamples(next);
  };

  if (versions === null || !draft || !saved) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6 md:p-8">
        {message ? (
          <p role="alert" className="text-sm text-alert">
            {message.text}
          </p>
        ) : (
          <div className="h-96 animate-pulse rounded-2xl bg-field" />
        )}
        <Link href="/admin/personalization-templates" className="text-xs font-semibold text-ink underline">
          Back to templates
        </Link>
      </div>
    );
  }

  const selectedPhotoIndex = draft.photoSlots.findIndex((s) => s.id === selectedId);
  const selectedPhoto = selectedPhotoIndex >= 0 ? draft.photoSlots[selectedPhotoIndex] : null;
  const selectedText = draft.textSlots.find((s) => s.id === selectedId) ?? null;
  const calendars = draft.calendarSlots ?? [];
  const selectedCalendar = calendars.find((s) => s.id === selectedId) ?? null;
  const widthIn = draft.canvas.width / draft.canvas.dpi;
  const heightIn = draft.canvas.height / draft.canvas.dpi;
  const above = artworkAbovePhotos(draft);
  const hasArtwork = draft.layers.some((l) => l.kind === 'fixed');

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-line pb-4 lg:flex-row lg:items-end">
        <div className="min-w-0 space-y-1.5">
          <Link href="/admin/personalization-templates" className="text-2xs font-semibold uppercase tracking-wide text-ink/50 hover:text-ink">
            Personalization templates
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={draft.name}
              onChange={(e) => change((t) => ({ ...t, name: e.target.value }))}
              disabled={!editable}
              aria-label="Design name"
              className="min-w-0 max-w-full rounded-lg border border-transparent bg-transparent px-1 font-display text-xl font-bold text-ink outline-none hover:border-line focus:border-ink disabled:hover:border-transparent md:text-2xl"
            />
            <StatusChip status={saved.status} size="sm" />
            {versions.length > 1 && (
              <select
                aria-label="Version"
                value={saved.version}
                onChange={(e) => {
                  const v = versions.find((x) => x.version === Number(e.target.value));
                  if (v) {
                    setSaved(v);
                    setDraft(v);
                    setSelectedId(null);
                  }
                }}
                className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink"
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {v.status}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-ink/55">
            {draft.photoSlots.length} photo space{draft.photoSlots.length === 1 ? '' : 's'}
            {draft.textSlots.length > 0 && ` · ${draft.textSlots.length} text field${draft.textSlots.length === 1 ? '' : 's'}`}
            {calendars.length > 0 && ` · ${calendars.length} calendar${calendars.length === 1 ? '' : 's'}`} · prints at {widthIn.toFixed(1)} × {heightIn.toFixed(1)} in
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <button type="button" onClick={save} disabled={!dirty || busy !== null} className={smallButton}>
                {busy === 'saving' ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={errors.length > 0 || busy !== null}
                title={errors.length > 0 ? 'Fix the problems listed before publishing' : undefined}
                className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink shadow-xs transition-colors hover:bg-gold-deep disabled:opacity-50"
              >
                {busy === 'publishing' ? 'Publishing…' : 'Publish'}
              </button>
            </>
          ) : saved.status === 'published' ? (
            <>
              <button type="button" onClick={() => setConfirmArchive(true)} disabled={busy !== null} className={smallButton}>
                Archive
              </button>
              <button type="button" onClick={newVersion} disabled={busy !== null} className="rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink shadow-xs hover:bg-gold-deep disabled:opacity-50">
                {busy === 'versioning' ? 'Creating…' : 'Edit as a new version'}
              </button>
            </>
          ) : (
            <button type="button" onClick={newVersion} disabled={busy !== null} className={smallButton}>
              Start a new version from this one
            </button>
          )}
        </div>
      </div>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>
          {message.text}
        </p>
      )}
      {!editable && saved.status === 'published' && (
        <p className="rounded-xl bg-tint px-4 py-2.5 text-xs text-ink/75">
          This version is live, so it can&apos;t be changed: orders keep exactly the design customers bought. Use “Edit as a new version” to make changes.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-3 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-line bg-tint/60 p-4 md:p-6">
            <TemplateStage
              template={draft}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={editable ? onStageChange : undefined}
              samples={samples}
              readOnly={!editable}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/60">
            <span>Drag a space to move it, drag a corner to resize it. Arrow keys nudge the selected space.</span>
            <span className="flex gap-2">
              <label className={`${smallButton} cursor-pointer`}>
                Try with your photos
                <input type="file" accept="image/*" multiple hidden onChange={(e) => void addSamples(e.target.files).finally(() => (e.target.value = ''))} />
              </label>
              {samples.size > 0 && (
                <button type="button" onClick={() => setSamples(new Map())} className={smallButton}>
                  Clear photos
                </button>
              )}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {notes && (
            <div className={`${card} border-amber-200 bg-amber-50/60`}>
              <h3 className="text-sm font-semibold text-ink">{notes.manual ? 'Draw the photo spaces' : `Found ${notes.found} photo space${notes.found === 1 ? '' : 's'}`}</h3>
              {[...notes.notes, ...notes.warnings].map((n) => (
                <p key={n} className="text-xs text-ink/75">
                  {n}
                </p>
              ))}
              <p className="text-xs text-ink/60">Check each space against the design, then publish.</p>
            </div>
          )}

          {(errors.length > 0 || warnings.length > 0) && (
            <div className={card}>
              <h3 className="text-sm font-semibold text-ink">{errors.length > 0 ? 'Fix before publishing' : 'Worth a look'}</h3>
              <ul className="space-y-1">
                {[...errors, ...warnings].map((issue, i) => (
                  <li key={`${issue.code}-${i}`} className={`text-xs ${issue.severity === 'error' ? 'text-alert' : 'text-ink/70'}`}>
                    {issue.ref ? (
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelectedId(issue.ref ?? null)}>
                        {issue.message}
                      </button>
                    ) : (
                      issue.message
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Photo spaces</h3>
              {editable && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    const added = addPhotoSlot(draft);
                    setDraft(added.template);
                    setSelectedId(added.id);
                  }}
                >
                  Add photo space
                </button>
              )}
            </div>
            {editable && (
              <PhotoGridForm
                onAdd={(options) => {
                  const added = addPhotoGrid(draft, options);
                  if (added.ids.length > 0) setDraft(added.template);
                }}
              />
            )}
            {draft.photoSlots.length === 0 ? (
              <p className="text-xs text-ink/60">No photo spaces yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {draft.photoSlots.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-pressed={s.id === selectedId}
                    className={`h-8 min-w-8 rounded-full px-2.5 text-xs font-semibold transition-colors ${s.id === selectedId ? 'bg-ink text-paper' : 'bg-tint text-ink hover:bg-field'}`}
                    title={s.label}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            {selectedPhoto && (
              <div className="border-t border-line pt-3">
                <PhotoSlotInspector
                  template={draft}
                  slot={selectedPhoto}
                  index={selectedPhotoIndex}
                  disabled={!editable}
                  onChange={(patch) => change((t) => updatePhotoSlot(t, selectedPhoto.id, patch))}
                  onRemove={() => {
                    change((t) => removeSlot(t, selectedPhoto.id));
                    setSelectedId(null);
                  }}
                  onMove={(delta) => change((t) => movePhotoSlot(t, selectedPhoto.id, delta))}
                  onDuplicate={() => {
                    const dup = duplicatePhotoSlot(draft, selectedPhoto.id);
                    setDraft(dup.template);
                    setSelectedId(dup.id);
                  }}
                />
              </div>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Text</h3>
              {editable && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    const added = addTextSlot(draft);
                    setDraft(added.template);
                    setSelectedId(added.id);
                  }}
                >
                  Add text
                </button>
              )}
            </div>
            {draft.textSlots.length === 0 && <p className="text-xs text-ink/60">Add a line for names, a date or a message.</p>}
            {draft.textSlots.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.textSlots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-pressed={s.id === selectedId}
                    className={`h-8 rounded-full px-3 text-xs font-semibold ${s.id === selectedId ? 'bg-ink text-paper' : 'bg-tint text-ink hover:bg-field'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {selectedText && (
              <div className="border-t border-line pt-3">
                <TextSlotInspector
                  slot={selectedText}
                  disabled={!editable}
                  onChange={(patch) => change((t) => updateTextSlot(t, selectedText.id, patch))}
                  onRemove={() => {
                    change((t) => removeSlot(t, selectedText.id));
                    setSelectedId(null);
                  }}
                />
              </div>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Calendar</h3>
              {editable && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    const added = addCalendarSlot(draft);
                    setDraft(added.template);
                    setSelectedId(added.id);
                  }}
                >
                  Add calendar
                </button>
              )}
            </div>
            {calendars.length === 0 && <p className="text-xs text-ink/60">Add a month calendar. Customers pick their special date and it is marked with a heart.</p>}
            {calendars.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {calendars.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-pressed={s.id === selectedId}
                    className={`h-8 rounded-full px-3 text-xs font-semibold ${s.id === selectedId ? 'bg-ink text-paper' : 'bg-tint text-ink hover:bg-field'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {selectedCalendar && (
              <div className="border-t border-line pt-3">
                <CalendarSlotInspector
                  slot={selectedCalendar}
                  disabled={!editable}
                  onChange={(patch) => change((t) => updateCalendarSlot(t, selectedCalendar.id, patch))}
                  onRemove={() => {
                    change((t) => removeSlot(t, selectedCalendar.id));
                    setSelectedId(null);
                  }}
                />
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className="text-sm font-semibold text-ink">Print and layering</h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Width (in)', widthIn, (n: number) => change((t) => setPrintSize(t, n, heightIn))],
                  ['Height (in)', heightIn, (n: number) => change((t) => setPrintSize(t, widthIn, n))],
                  ['DPI', draft.canvas.dpi, (n: number) => change((t) => setPrintSize(t, widthIn, heightIn, Math.round(n)))],
                ] as const
              ).map(([label, value, set]) => (
                <label key={label} className="block space-y-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{label}</span>
                  <input
                    type="number"
                    min={label === 'DPI' ? 72 : 1}
                    step={label === 'DPI' ? 1 : 0.1}
                    value={Math.round(value * 100) / 100}
                    disabled={!editable}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0) set(n);
                    }}
                    className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink disabled:bg-field"
                  />
                </label>
              ))}
            </div>
            <p className="text-2xs text-ink/50">
              Keep the design&apos;s proportions ({(widthIn / heightIn).toFixed(3)}). Customers buying another size get the same layout scaled to it.
            </p>
            {hasArtwork && (
              <fieldset className="space-y-1.5">
                <legend className="text-2xs font-semibold uppercase tracking-wide text-ink/55">The design image sits</legend>
                <p className="text-2xs text-ink/60">
                  The design image is <strong className="font-semibold text-ink">printed</strong> with the photos and text. Room previews and frame mockups are shop presentation only and are never printed.
                </p>
                {(
                  [
                    [true, 'Over the photos (photo areas are transparent windows)'],
                    [false, 'Under the photos (photos cover placeholder areas)'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={String(value)} className="flex items-center gap-2 text-xs text-ink">
                    <input type="radio" name="artwork-order" checked={above === value} disabled={!editable} onChange={() => change((t) => setArtworkAbovePhotos(t, value))} className="accent-[#c9861a]" />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-xs text-ink">
              <span>Background colour</span>
              <input
                type="color"
                value={draft.background?.color ?? '#ffffff'}
                disabled={!editable}
                onChange={(e) => change((t) => ({ ...t, background: { type: 'color', color: e.target.value } }))}
                className="h-8 w-12 cursor-pointer rounded border border-line"
              />
            </label>
          </div>

          <div className={card}>
            <ProductLinks templateId={draft.id} live={live} />
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title={`Archive version ${saved.version}?`}
        message="Customers can no longer choose this design. Orders already placed with it are not affected."
        confirmText="Archive"
        variant="danger"
      />
    </div>
  );
}
