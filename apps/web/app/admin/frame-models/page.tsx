'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FRAME_MATERIALS, suggestMakingCost, type FrameModel, type FramingCostRates } from '@bro-pics/shared';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { useToast } from '../../../components/ui/Toast';
import { FramedPreview, lookOf } from '../../../components/admin/product-editor/FramedPreview';
import { inr, rupees, toPaise, useCatalogueUpload } from '../../../components/admin/product-editor/use-catalogue-upload';

type Draft = Omit<FrameModel, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY: Draft = {
  name: '',
  code: '',
  colour: '',
  colourHex: '#5a3825',
  material: 'Wood',
  mouldingWidthIn: 1,
  image: null,
  costPerFoot: 0,
  priceDelta: 0,
  isActive: true,
  sortOrder: 10,
};

const field = 'h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-ink';
const label = 'mb-1 block text-2xs font-bold uppercase tracking-wider text-ink/60';

/** Marks how wide the moulding is in the uploaded photo: a draggable inner outline over the picture. */
function BorderMarker({ image, onChange }: { image: NonNullable<Draft['image']>; onChange: (borderPx: number) => void }) {
  const pct = (image.borderPx / image.widthPx) * 100;
  const pctY = (image.borderPx / image.heightPx) * 100;
  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-lg border border-line bg-field">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url.replace(/w=\d+/, 'w=800')} alt="Frame photo" className="block w-full" />
        <div
          className="pointer-events-none absolute border-2 border-dashed border-sky-500 bg-sky-400/10"
          style={{ left: `${pct}%`, right: `${pct}%`, top: `${pctY}%`, bottom: `${pctY}%` }}
        />
      </div>
      <input
        type="range"
        min={1}
        max={Math.floor(Math.min(image.widthPx, image.heightPx) * 0.45)}
        value={image.borderPx}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c9861a]"
        aria-label="Moulding width in the photo"
      />
      <p className="text-2xs text-ink/55">Drag until the dashed line sits on the inner edge of the moulding (where the picture starts).</p>
    </div>
  );
}

export default function FrameModelsPage() {
  const api = useAdminApi();
  const upload = useCatalogueUpload();
  const { showToast } = useToast();
  const [models, setModels] = useState<FrameModel[] | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [rates, setRates] = useState<FramingCostRates | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api<{ models: FrameModel[]; rates: FramingCostRates; usage: Record<string, number> }>('/api/admin/frame-models');
    setModels(r.models);
    setRates(r.rates);
    setUsage(r.usage);
  }, [api]);

  useEffect(() => {
    load().catch((e) => showToast(e instanceof Error ? e.message : 'Frame models could not be loaded', 'error'));
  }, [load, showToast]);

  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const img = await upload(file, { alt: editing?.draft.name ? `${editing.draft.name} frame` : 'Frame model', tag: 'frame-model' });
      set({ image: { mediaId: img.id, url: img.url, widthPx: img.width, heightPx: img.height, borderPx: Math.round(Math.min(img.width, img.height) * 0.1) } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim() || !d.code.trim() || !d.colour.trim()) {
      showToast('Enter the name, code and colour.', 'error');
      return;
    }
    setBusy(true);
    try {
      if (editing.id) await api(`/api/admin/frame-models/${editing.id}`, { method: 'PATCH', body: JSON.stringify(d) });
      else await api('/api/admin/frame-models', { method: 'POST', body: JSON.stringify(d) });
      showToast(editing.id ? 'Frame model saved' : 'Frame model added', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (m: FrameModel) => {
    try {
      await api(`/api/admin/frame-models/${m.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !m.isActive }) });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update', 'error');
    }
  };

  const saveRates = async () => {
    if (!rates) return;
    try {
      await api('/api/admin/frame-models/rates', { method: 'PUT', body: JSON.stringify(rates) });
      showToast('Making-cost rates saved', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save rates', 'error');
    }
  };

  const draft = editing?.draft;
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Frame models</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-ink/60">
            Every moulding you sell. Products choose from these; customers see the photo of the frame around their picture. Cost per foot stays private and suggests each size&rsquo;s making cost.
          </p>
        </div>
        <button type="button" onClick={() => setEditing({ id: null, draft: { ...EMPTY, sortOrder: (models?.length ?? 0) * 10 + 10 } })} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90">
          Add frame model
        </button>
      </div>

      {models === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-tint" />)}</div>
      ) : models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper p-10 text-center">
          <p className="font-semibold text-ink">No frame models yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink/60">Add the mouldings you stock — a straight photo of each frame, its width and cost per foot. Then every product can offer them.</p>
          <button type="button" onClick={() => setEditing({ id: null, draft: EMPTY })} className="mt-4 h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-paper">
            Add your first frame model
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <article key={m.id} className={`overflow-hidden rounded-2xl border border-line bg-paper ${m.isActive ? '' : 'opacity-60'}`}>
              <FramedPreview look={lookOf(m)} widthIn={8} heightIn={10} className="p-3 pb-0" />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-ink">{m.name}</h2>
                    <p className="font-mono text-2xs text-ink/55">{m.code}</p>
                  </div>
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-ink/15" style={{ backgroundColor: m.colourHex }} title={m.colour} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs text-ink/70">
                  <dt>Material</dt>
                  <dd className="text-right text-ink">{m.material}</dd>
                  <dt>Moulding width</dt>
                  <dd className="text-right text-ink">{m.mouldingWidthIn}&Prime;</dd>
                  <dt>Cost per foot</dt>
                  <dd className="text-right text-ink">{inr(m.costPerFoot)}</dd>
                  <dt>Making cost 12×18</dt>
                  <dd className="text-right text-ink">{rates ? inr(suggestMakingCost({ widthIn: 12, heightIn: 18 }, m, rates)) : '—'}</dd>
                  <dt>Used by</dt>
                  <dd className="text-right text-ink">{usage[m.id] ?? 0} product{usage[m.id] === 1 ? '' : 's'}</dd>
                </dl>
                {!m.image && <p className="rounded-lg bg-amber-50 px-2 py-1 text-2xs text-amber-800">No photo yet — the shop shows a plain stock frame.</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => {
                      // Only the editable fields: id and dates are kept by the server.
                      const { id: _id, createdAt: _c, updatedAt: _u, ...draft } = m;
                      setEditing({ id: m.id, draft });
                    }} className="h-9 flex-1 rounded-xl border border-line text-xs font-semibold text-ink hover:bg-field">
                    Edit
                  </button>
                  <button type="button" onClick={() => void toggle(m)} className="h-9 flex-1 rounded-xl border border-line text-xs font-semibold text-ink hover:bg-field">
                    {m.isActive ? 'Switch off' : 'Switch on'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {rates && (
        <section className="space-y-3 rounded-2xl border border-line bg-paper p-5">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Making-cost rates</h2>
            <p className="text-2xs text-ink/60">Used only to suggest a making cost for each size (moulding by the foot + these by area + per frame). Private — customers never see costs.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['printPerSqFt', 'Print, per sq ft'],
                ['glassPerSqFt', 'Glass / acrylic, per sq ft'],
                ['backingPerSqFt', 'Back board, per sq ft'],
                ['perFrame', 'Labour + hook + packing, per frame'],
              ] as const
            ).map(([key, text]) => (
              <label key={key} className="block">
                <span className={label}>{text}</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">₹</span>
                  <input className={`${field} pl-7`} inputMode="decimal" value={rupees(rates[key])} onChange={(e) => setRates({ ...rates, [key]: toPaise(e.target.value) })} />
                </div>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void saveRates()} className="h-9 rounded-xl border border-line px-4 text-xs font-semibold text-ink hover:bg-field">
            Save rates
          </button>
        </section>
      )}

      <p className="text-2xs text-ink/50">
        Changing a model&rsquo;s name or material updates a product&rsquo;s sizes the next time that product is saved. <Link href="/admin/products" className="underline">Products</Link>
      </p>

      <AdminDrawer
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.draft.name || 'frame model'}` : 'Add frame model'}
        width="2xl"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink">
              Cancel
            </button>
            <button type="button" disabled={busy || uploading} onClick={() => void save()} className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-40">
              {busy ? 'Saving…' : 'Save frame model'}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={label}>Name customers see</span>
                  <input className={field} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Teak Classic 1 inch" />
                </label>
                <label className="block">
                  <span className={label}>Your moulding code</span>
                  <input className={`${field} font-mono`} value={draft.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="TK-101" />
                </label>
                <label className="block">
                  <span className={label}>Material</span>
                  <select className={field} value={draft.material} onChange={(e) => set({ material: e.target.value as Draft['material'] })}>
                    {FRAME_MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>Colour name</span>
                  <input className={field} value={draft.colour} onChange={(e) => set({ colour: e.target.value })} placeholder="Walnut" />
                </label>
                <label className="block">
                  <span className={label}>Colour (for the swatch)</span>
                  <div className="flex gap-2">
                    <input type="color" value={draft.colourHex} onChange={(e) => set({ colourHex: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-paper" aria-label="Swatch colour" />
                    <input className={`${field} font-mono`} value={draft.colourHex} onChange={(e) => set({ colourHex: e.target.value })} />
                  </div>
                </label>
                <label className="block">
                  <span className={label}>Moulding width (inches)</span>
                  <input className={field} inputMode="decimal" value={draft.mouldingWidthIn} onChange={(e) => set({ mouldingWidthIn: Math.max(0.2, Math.min(6, Number(e.target.value) || 0.2)) })} />
                </label>
                <label className="block">
                  <span className={label}>Moulding cost per running foot</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">₹</span>
                    <input className={`${field} pl-7`} inputMode="decimal" value={rupees(draft.costPerFoot)} onChange={(e) => set({ costPerFoot: toPaise(e.target.value) })} />
                  </div>
                </label>
                <label className="block">
                  <span className={label}>Price change vs your base price</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">₹</span>
                    <input
                      className={`${field} pl-7`}
                      inputMode="decimal"
                      value={(draft.priceDelta / 100).toString()}
                      onChange={(e) => set({ priceDelta: Math.round((Number(e.target.value) || 0) * 100) })}
                    />
                  </div>
                  <span className="mt-1 block text-2xs text-ink/50">Pre-fills prices: e.g. 200 makes this model ₹200 dearer than the first model. Can be negative.</span>
                </label>
                <label className="block">
                  <span className={label}>Order in lists</span>
                  <input className={field} inputMode="numeric" value={draft.sortOrder} onChange={(e) => set({ sortOrder: Math.round(Number(e.target.value) || 0) })} />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-line p-4">
                <span className={label}>Frame photo</span>
                <p className="text-2xs text-ink/60">A straight, front-on photo of the whole frame, cropped to its outer edge (an empty frame works best). It is wrapped around each customer&rsquo;s picture.</p>
                {draft.image ? <BorderMarker image={draft.image} onChange={(borderPx) => set({ image: { ...draft.image!, borderPx } })} /> : null}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
                <div className="flex gap-2">
                  <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-9 rounded-xl border border-line px-3 text-xs font-semibold text-ink hover:bg-field disabled:opacity-40">
                    {uploading ? 'Uploading…' : draft.image ? 'Replace photo' : 'Upload frame photo'}
                  </button>
                  {draft.image && (
                    <button type="button" onClick={() => set({ image: null })} className="h-9 rounded-xl px-3 text-xs font-semibold text-alert hover:bg-red-50">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <span className={label}>Preview</span>
              <FramedPreview look={lookOf(draft)} widthIn={8} heightIn={12} label="8×12 portrait" />
              <FramedPreview look={lookOf(draft)} widthIn={12} heightIn={8} label="12×8 landscape" />
              {rates && <p className="text-2xs text-ink/60">Suggested making cost at 12×18: <strong className="text-ink">{inr(suggestMakingCost({ widthIn: 12, heightIn: 18 }, draft, rates))}</strong></p>}
            </div>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
