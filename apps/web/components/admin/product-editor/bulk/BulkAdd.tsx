'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_FRAMING_COST_RATES, DEFAULT_GLITTER_EXTRA, MAX_GLITTER_EXTRA, rowsFromPriceList, type FrameModel, type FramingCostRates, type PriceList } from '@bro-pics/shared';
import { useAdminApi, AdminApiError } from '../../template-builder/use-admin-api';
import { useToast } from '../../../ui/Toast';
import { useCatalogueUpload } from '../use-catalogue-upload';
import { makeProductPhotos } from '../product-photos';
import { lookOf } from '../FramedPreview';
import { PriceListEditor } from './PriceListEditor';
import { readPicture } from './bulk-picture';
import { checkSizes, dedupeNames, looksLikeCameraName, nameFromFilename, orientationFor, MIN_SELLABLE_DPI, type Orientation } from './bulk-plan';
import { processJob, type BulkDeps, type BulkJob, type BulkSettings } from './bulk-runner';

interface Options {
  categories: Array<{ id: string; name: string; slug: string }>;
  frameModels: FrameModel[];
  rates: FramingCostRates;
}

type Status = 'ready' | 'working' | 'saved' | 'failed' | 'published';

interface Item extends BulkJob {
  thumb: string;
  status: Status;
  step: string;
  error?: string;
  title?: string;
  warnings: string[];
  skipped: string[];
  selected: boolean;
  needsName: boolean;
}

const MAX_FILES = 100;
const field = 'h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-ink';
const label = 'mb-1 block text-2xs font-bold uppercase tracking-wider text-ink/60';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let seq = 0;

function DpiChip({ dpi }: { dpi: number }) {
  const tone = dpi >= 250 ? 'bg-emerald-50 text-emerald-800' : dpi >= MIN_SELLABLE_DPI ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-alert';
  const text = dpi >= 250 ? 'Sharp' : dpi >= MIN_SELLABLE_DPI ? 'Good' : 'Too soft';
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${tone}`} title={`${dpi} pixels per inch at the biggest size sold`}>
      {text} · {dpi} ppi
    </span>
  );
}

export function BulkAdd() {
  const api = useAdminApi();
  const upload = useCatalogueUpload();
  const { showToast } = useToast();
  const [options, setOptions] = useState<Options | null>(null);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [priceListId, setPriceListId] = useState('');
  const [editingList, setEditingList] = useState<PriceList | 'new' | null>(null);
  const [glitterOn, setGlitterOn] = useState(false);
  const [glitterRupees, setGlitterRupees] = useState(String(DEFAULT_GLITTER_EXTRA / 100));
  const [makePhotos, setMakePhotos] = useState(true);
  const [dropSoft, setDropSoft] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const stopRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  itemsRef.current = items;

  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([api<Options>('/api/admin/products/setup/options'), api<{ priceLists: PriceList[] }>('/api/admin/price-lists')]);
      setOptions(o);
      setLists(l.priceLists);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'The page could not be loaded.');
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  // Leaving while frames are being made would stop the work half way.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (running) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const models = useMemo(() => new Map((options?.frameModels ?? []).map((m) => [m.id, m])), [options]);
  const rates = options?.rates ?? DEFAULT_FRAMING_COST_RATES;
  const priceList = lists.find((l) => l.id === priceListId) ?? null;
  const glitterExtra = Math.round((Number(glitterRupees.replace(/[^\d.]/g, '')) || 0) * 100);
  const glitterBad = glitterOn && (glitterExtra <= 0 || glitterExtra > MAX_GLITTER_EXTRA);

  const patch = useCallback((id: string, p: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

  // --- Adding pictures ---------------------------------------------------------------------
  const addFiles = async (files: File[]) => {
    const pictures = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    const skipped = files.length - pictures.length;
    const room = MAX_FILES - items.length;
    const take = pictures.slice(0, Math.max(0, room));
    if (skipped > 0) showToast(`${skipped} file${skipped === 1 ? ' was' : 's were'} not a JPG, PNG or WebP picture and ${skipped === 1 ? 'was' : 'were'} left out.`, 'error');
    if (pictures.length > take.length) showToast(`A batch holds up to ${MAX_FILES} pictures. ${pictures.length - take.length} were left out.`, 'error');
    const added: Item[] = [];
    for (const file of take) {
      try {
        const info = await readPicture(file);
        const camera = looksLikeCameraName(file.name);
        added.push({
          id: `b${Date.now().toString(36)}${seq++}`,
          file,
          name: camera ? '' : nameFromFilename(file.name),
          subject: '',
          orientation: 'auto',
          width: info.width,
          height: info.height,
          thumb: info.thumb,
          status: 'ready',
          step: '',
          warnings: [],
          skipped: [],
          selected: true,
          needsName: camera,
        });
      } catch (e) {
        showToast(`${file.name}: ${e instanceof Error ? e.message : 'could not be read'}`, 'error');
      }
    }
    setItems((prev) => [...prev, ...added]);
  };

  // --- What each picture will become, shown before anything is made ---------------------------
  const plans = useMemo(() => {
    const map = new Map<string, { orientation: Orientation; square: boolean; sizes: number; skipped: string[]; worstDpi: number | null; kept: number | null; none: boolean }>();
    for (const it of items) {
      const shape = orientationFor(it, it.orientation);
      if (!priceList) {
        map.set(it.id, { orientation: shape.orientation, square: shape.square, sizes: 0, skipped: [], worstDpi: null, kept: null, none: false });
        continue;
      }
      const built = rowsFromPriceList(priceList, shape.orientation, models, rates);
      const verdict = checkSizes(it, built.rows, { dropSoft });
      const sellable = verdict.rows.filter((r) => r.isActive).length;
      map.set(it.id, { orientation: shape.orientation, square: shape.square, sizes: verdict.rows.length, skipped: verdict.tooSoft, worstDpi: verdict.worstDpi, kept: verdict.keptAtWorst, none: sellable === 0 });
    }
    return map;
  }, [items, priceList, models, rates, dropSoft]);

  const pending = items.filter((i) => i.status === 'ready' || i.status === 'failed');
  const unnamed = pending.filter((i) => i.name.trim().length < 2);
  const blocked = pending.filter((i) => plans.get(i.id)?.none);
  const savedCount = items.filter((i) => i.status === 'saved' || i.status === 'published').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const canRun = Boolean(options && categoryId && priceList && pending.length > 0 && unnamed.length === 0 && !glitterBad && !running);

  // --- Making the frames -----------------------------------------------------------------------
  const run = async () => {
    if (!options || !priceList || !canRun) return;
    stopRef.current = false;
    setRunning(true);
    const existing = await api<{ products?: Array<{ slug?: string; title?: string; productCode?: string }> }>('/api/admin/products').catch(() => ({ products: [] }));
    const taken = {
      slugs: new Set((existing.products ?? []).map((p) => p.slug).filter((x): x is string => Boolean(x))),
      codes: new Set((existing.products ?? []).map((p) => p.productCode?.toUpperCase()).filter((x): x is string => Boolean(x))),
    };
    // Repeated names get a number, here, so the list shows what will be made.
    const todo = itemsRef.current.filter((i) => i.status === 'ready' || i.status === 'failed');
    const doneTitles = new Set([...itemsRef.current.filter((i) => i.productId).map((i) => i.name), ...(existing.products ?? []).map((p) => p.title ?? '')].filter(Boolean));
    const names = dedupeNames(todo.map((i) => i.name), doneTitles);
    todo.forEach((it, n) => {
      if (!it.artwork && names[n] !== it.name) patch(it.id, { name: names[n]! });
    });

    const category = options.categories.find((c) => c.id === categoryId);
    const settings: BulkSettings = {
      categoryId,
      categoryName: category?.name ?? '',
      priceList,
      models,
      rates,
      glitter: glitterOn ? { enabled: true, extraPrice: glitterExtra } : { enabled: false, extraPrice: DEFAULT_GLITTER_EXTRA },
      makePhotos,
      dropSoft,
      dispatchDaysMin: 2,
      dispatchDaysMax: 4,
    };
    const deps: BulkDeps = { api, upload, makePhotos: makeProductPhotos, lookOf, sleep };

    for (const planned of todo) {
      if (stopRef.current) break;
      const current = itemsRef.current.find((i) => i.id === planned.id);
      if (!current || current.productId) continue;
      patch(current.id, { status: 'working', step: 'Starting…', error: undefined });
      try {
        const res = await processJob(
          deps,
          settings,
          current,
          taken,
          (p) => patch(current.id, p),
          (step) => patch(current.id, { step })
        );
        patch(current.id, { status: 'saved', step: '', title: res.title, slug: res.slug, productId: res.productId, warnings: res.warnings, skipped: res.skippedSizes, selected: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'This frame could not be made.';
        patch(current.id, { status: 'failed', step: '', error: message });
        // A signed-out session would fail every remaining picture the same way.
        if (e instanceof AdminApiError && e.status === 401) {
          showToast('Your session ended. Sign in again, then press “Retry failed”.', 'error');
          break;
        }
      }
    }
    setRunning(false);
    const after = itemsRef.current;
    const ok = after.filter((i) => i.status === 'saved').length;
    const bad = after.filter((i) => i.status === 'failed').length;
    showToast(bad ? `${ok} saved as drafts, ${bad} need another try.` : `${ok} saved as drafts. Check them, then publish.`, bad ? 'error' : 'success');
  };

  // --- Publishing ------------------------------------------------------------------------------
  const publish = async (ids: string[]) => {
    setPublishing(true);
    let ok = 0;
    for (const id of ids) {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it?.productId) continue;
      try {
        await api(`/api/admin/products/${it.productId}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
        patch(id, { status: 'published', error: undefined });
        ok++;
      } catch (e) {
        patch(id, { error: e instanceof Error ? e.message : 'It could not be published.' });
      }
    }
    setPublishing(false);
    showToast(`${ok} published${ok < ids.length ? `, ${ids.length - ok} could not be` : ''}.`, ok === ids.length ? 'success' : 'error');
  };
  const drafts = items.filter((i) => i.status === 'saved');
  const selectedDrafts = drafts.filter((i) => i.selected);

  if (loadError) return <p className="rounded-xl bg-red-50 p-4 text-sm text-alert">{loadError}</p>;
  if (!options) return <div className="h-64 animate-pulse rounded-2xl bg-tint" />;

  const activeModels = options.frameModels;
  return (
    <div className="pb-32">
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="min-w-0 flex-1">
          <Link href="/admin/products" className="text-2xs font-medium text-ink/50 hover:text-ink">
            ← Products
          </Link>
          <h1 className="font-display text-2xl font-bold text-ink">Add many frames</h1>
          <p className="text-xs text-ink/60">Drop many pictures. Each becomes a ready-made frame, saved as a draft with its name, details, prices and shop photos. Check them, then publish.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* 1. Settings */}
        <section className="rounded-3xl border border-line bg-paper p-5 md:p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-ink">1 · For every picture in this batch</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={label} htmlFor="bulk-category">
                Category
              </label>
              <select id="bulk-category" className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={running}>
                <option value="">Choose where these are listed…</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="bulk-pricelist">
                Price list (sizes, frame models and prices)
              </label>
              <div className="flex gap-2">
                <select id="bulk-pricelist" className={field} value={priceListId} onChange={(e) => setPriceListId(e.target.value)} disabled={running}>
                  <option value="">{lists.length ? 'Choose a price list…' : 'No price list yet — make one'}</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.rows.filter((r) => r.isActive).length} lines)
                    </option>
                  ))}
                </select>
                <button type="button" disabled={running} onClick={() => setEditingList(priceList ?? 'new')} className="h-10 shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-field disabled:opacity-50">
                  {priceList ? 'Edit' : 'New'}
                </button>
                {priceList && (
                  <button type="button" disabled={running} onClick={() => setEditingList('new')} className="h-10 shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-field disabled:opacity-50">
                    New list
                  </button>
                )}
              </div>
            </div>
          </div>

          {editingList && (
            <div className="mt-4">
              <PriceListEditor
                key={editingList === 'new' ? 'new' : editingList.id}
                models={activeModels}
                list={editingList === 'new' ? null : editingList}
                onClose={() => setEditingList(null)}
                onSaved={(l) => {
                  setLists((prev) => [...prev.filter((x) => x.id !== l.id), l].sort((a, b) => a.name.localeCompare(b.name)));
                  setPriceListId(l.id);
                  setEditingList(null);
                }}
                onDeleted={(id) => {
                  setLists((prev) => prev.filter((x) => x.id !== id));
                  if (priceListId === id) setPriceListId('');
                  setEditingList(null);
                }}
              />
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-line p-3">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1a1a1a]" checked={glitterOn} onChange={(e) => setGlitterOn(e.target.checked)} disabled={running} />
                <span>
                  <strong className="block text-sm text-ink">✨ Offer glitter finish on all of these</strong>
                  <span className="text-xs text-ink/60">Customers can pick glitter printing for an extra price per frame.</span>
                </span>
              </label>
              {glitterOn && (
                <label className="mt-2 flex items-center gap-2 pl-7 text-xs text-ink/70">
                  Extra price per frame ₹
                  <input aria-label="Glitter extra price per frame" inputMode="decimal" className={`${field} h-8 w-24 text-right`} value={glitterRupees} onChange={(e) => setGlitterRupees(e.target.value)} disabled={running} />
                </label>
              )}
              {glitterBad && <p className="mt-1 pl-7 text-2xs text-alert">Enter an extra price between ₹1 and ₹10,000.</p>}
            </div>
            <div className="space-y-2 rounded-2xl border border-line p-3 text-xs">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" checked={makePhotos} onChange={(e) => setMakePhotos(e.target.checked)} disabled={running} />
                <span>
                  <strong className="block text-sm text-ink">Make the shop photos</strong>
                  <span className="text-ink/60">{glitterOn ? '6' : '5'} photos for each frame (about 8 requests per frame, so 50 frames take around 8 minutes). Switch off for a faster first pass.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" checked={dropSoft} onChange={(e) => setDropSoft(e.target.checked)} disabled={running} />
                <span>
                  <strong className="block text-sm text-ink">Leave out sizes that would print soft</strong>
                  <span className="text-ink/60">Under {MIN_SELLABLE_DPI} pixels per inch. Each picture’s row shows what is left out.</span>
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* 2. Pictures */}
        <section className="rounded-3xl border border-line bg-paper p-5 md:p-6">
          <h2 className="mb-1 font-display text-lg font-bold text-ink">2 · Pictures</h2>
          <p className="mb-4 text-xs text-ink/60">The name comes from the file name; change it where it is wrong. Up to {MAX_FILES} pictures at a time (JPG, PNG or WebP).</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!running) void addFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center ${dragging ? 'border-gold bg-gold/5' : 'border-line bg-field/40'}`}
          >
            <p className="text-sm font-semibold text-ink">Drag pictures here</p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label="Choose pictures"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) void addFiles(files);
              }}
            />
            <button type="button" disabled={running} onClick={() => fileInput.current?.click()} className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-50">
              Choose pictures
            </button>
          </div>

          {items.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line" aria-label="Pictures in this batch">
              {items.map((it) => {
                const plan = plans.get(it.id);
                const locked = it.status === 'working' || it.status === 'saved' || it.status === 'published';
                return (
                  <li key={it.id} className="flex flex-wrap items-start gap-3 p-3">
                    {it.status === 'saved' && (
                      <input type="checkbox" aria-label={`Select ${it.title ?? it.name}`} checked={it.selected} onChange={(e) => patch(it.id, { selected: e.target.checked })} className="mt-4 h-4 w-4 accent-[#1a1a1a]" />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.thumb} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
                    <div className="min-w-[14rem] flex-1 space-y-1.5">
                      <div className="flex flex-wrap gap-2">
                        <input
                          aria-label={`Name for ${it.file.name}`}
                          className={`${field} h-9 min-w-[10rem] flex-1 ${it.needsName && it.name.trim().length < 2 ? 'border-alert bg-red-50' : ''}`}
                          value={it.name}
                          placeholder={it.needsName ? 'Type a name (the file name says nothing)' : 'Name'}
                          disabled={locked || running}
                          onChange={(e) => patch(it.id, { name: e.target.value })}
                        />
                        <input
                          aria-label={`What ${it.file.name} shows`}
                          className={`${field} h-9 min-w-[9rem] flex-1`}
                          value={it.subject}
                          placeholder="What it shows (optional)"
                          disabled={locked || running}
                          onChange={(e) => patch(it.id, { subject: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-2xs text-ink/60">
                        <span>
                          {it.file.name} · {it.width}×{it.height}px
                        </span>
                        {plan && (
                          <>
                            <select
                              aria-label={`Shape of ${it.file.name}`}
                              value={it.orientation}
                              disabled={locked || running}
                              onChange={(e) => patch(it.id, { orientation: e.target.value as Item['orientation'] })}
                              className="h-7 rounded-lg border border-line bg-paper px-1.5 text-2xs"
                            >
                              <option value="auto">Auto ({plan.orientation})</option>
                              <option value="landscape">Landscape</option>
                              <option value="portrait">Portrait</option>
                            </select>
                            {plan.square && it.orientation === 'auto' && <span className="text-amber-700">Square picture: check the shape</span>}
                            {priceList && plan.worstDpi !== null && <DpiChip dpi={plan.worstDpi} />}
                            {priceList && <span>{plan.none ? 'No size can be sold' : `${plan.sizes} lines`}</span>}
                            {plan.skipped.length > 0 && <span className="text-amber-700">Leaves out {plan.skipped.join(', ')} (too soft)</span>}
                            {priceList && plan.kept !== null && plan.kept < 0.85 && <span className="text-amber-700">Crops about {Math.round((1 - plan.kept) * 100)}% at the narrowest shape</span>}
                          </>
                        )}
                      </div>
                      {it.status === 'working' && <p className="text-2xs font-semibold text-ink/70">{it.step}</p>}
                      {it.error && (
                        <p role="alert" className="text-2xs font-medium text-alert">
                          {it.error}
                        </p>
                      )}
                      {it.warnings.length > 0 && <p className="text-2xs text-amber-800">{it.warnings.join(' · ')}</p>}
                    </div>
                    <div className="flex items-center gap-2 self-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-2xs font-bold ${
                          it.status === 'published' ? 'bg-emerald-100 text-emerald-800' : it.status === 'saved' ? 'bg-sky-100 text-sky-800' : it.status === 'failed' ? 'bg-red-100 text-alert' : it.status === 'working' ? 'bg-amber-100 text-amber-800' : 'bg-tint text-ink/60'
                        }`}
                      >
                        {it.status === 'ready' ? 'Ready' : it.status === 'working' ? 'Making…' : it.status === 'saved' ? 'Draft saved' : it.status === 'published' ? 'Published' : 'Failed'}
                      </span>
                      {it.productId && (
                        <Link href={`/admin/products/${it.productId}`} target="_blank" className="text-2xs font-semibold text-gold-deep hover:underline">
                          Open ↗
                        </Link>
                      )}
                      {(it.status === 'ready' || it.status === 'failed') && !running && (
                        <button type="button" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} className="h-7 w-7 rounded-full text-ink/40 hover:bg-field hover:text-alert">
                          ×
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. Publish */}
        {drafts.length > 0 && (
          <section className="rounded-3xl border border-line bg-paper p-5 md:p-6">
            <h2 className="mb-1 font-display text-lg font-bold text-ink">3 · Publish</h2>
            <p className="mb-3 text-xs text-ink/60">These are drafts: customers cannot see them yet. Open any to check, then publish the ones that look right.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={publishing || selectedDrafts.length === 0} onClick={() => void publish(selectedDrafts.map((i) => i.id))} className="h-10 rounded-xl bg-gold px-5 text-sm font-bold text-ink hover:bg-gold-deep disabled:opacity-40">
                {publishing ? 'Publishing…' : `Publish selected (${selectedDrafts.length})`}
              </button>
              <button type="button" disabled={publishing} onClick={() => setItems((prev) => prev.map((i) => (i.status === 'saved' ? { ...i, selected: !drafts.every((d) => d.selected) } : i)))} className="h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-field">
                {drafts.every((d) => d.selected) ? 'Select none' : 'Select all drafts'}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Floating actions: the admin page itself does not scroll. */}
      <div className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-gold/20 bg-ink py-2 pl-4 pr-2 text-paper shadow-2xl md:left-[calc(50%+8rem)]">
        <span className="text-xs text-paper/80">
          {items.length === 0 ? 'No pictures yet' : `${items.length} picture${items.length === 1 ? '' : 's'} · ${savedCount} saved${failedCount ? ` · ${failedCount} failed` : ''}`}
        </span>
        {running ? (
          <button type="button" onClick={() => (stopRef.current = true)} className="h-9 rounded-xl border border-paper/25 px-4 text-sm font-semibold text-paper hover:bg-paper/10">
            Stop after this one
          </button>
        ) : (
          <button
            type="button"
            disabled={!canRun}
            onClick={() => void run()}
            title={!categoryId ? 'Choose a category first' : !priceList ? 'Choose a price list first' : unnamed.length ? 'Give every picture a name' : pending.length === 0 ? 'Add pictures first' : undefined}
            className="h-9 rounded-xl bg-gold px-4 text-sm font-bold text-ink hover:bg-gold-deep disabled:opacity-40"
          >
            {failedCount > 0 && pending.length === failedCount ? `Retry failed (${failedCount})` : `Create ${pending.length || ''} draft${pending.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {blocked.length > 0 && !running && <p className="mt-3 text-xs text-alert">{blocked.length} picture{blocked.length === 1 ? ' is' : 's are'} too small for every size in this price list. They will fail unless you switch off “Leave out sizes that would print soft” or use larger pictures.</p>}
    </div>
  );
}
