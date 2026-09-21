'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import type { FrameTemplate, TextZone, ClipartOption, Variant } from '@bro-pics/shared';
import { getFirebaseApp } from '../../../../../lib/firebase-client';

interface TemplateFormPageProps {
  params: Promise<{ id: string }>;
}

function blankTextZone(): TextZone {
  return { fieldKey: '', label: '', x: 0.08, y: 0.84, width: 0.84, height: 0.065, maxLength: 40, align: 'center' };
}

function blankClipartOption(): ClipartOption {
  return { id: '', label: '', assetUrl: '', x: 0.82, y: 0.06, width: 0.1, height: 0.1 };
}

// Editing a template's layout here is meant to create a NEW FrameTemplate
// doc (version + 1, isCurrent: true) and flip the previous doc's
// isCurrent to false — never mutate an existing doc in place, so an
// already-placed order's pinned Customization.templateVersion is never
// affected by a later edit (see the live-personalization plan, Step 7).
// There is no write API for this yet (see the backend requirements doc),
// so Save is local-state only, same pattern as /admin/products/[id].
export default function AdminTemplateFormPage({ params }: TemplateFormPageProps) {
  const [productId, setProductId] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<FrameTemplate | null>(null);

  const [mockupUrl, setMockupUrl] = useState('');
  const [maskUrl, setMaskUrl] = useState('');
  const [overlayUrl, setOverlayUrl] = useState('');
  const [textZones, setTextZones] = useState<TextZone[]>([]);
  const [clipartOptions, setClipartOptions] = useState<ClipartOption[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setProductId(p.id));
  }, [params]);

  useEffect(() => {
    if (!productId) return;
    const db = getFirestore(getFirebaseApp());
    getDocs(collection(db, 'products', productId, 'variants')).then((snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Variant);
      setVariants(list);
      if (list.length > 0) setSelectedVariantId(list[0].id);
      setLoadingVariants(false);
    });
  }, [productId]);

  useEffect(() => {
    if (!selectedVariantId) return;
    setLoadingTemplate(true);
    setSaveNote(null);
    fetch(`/api/frame-templates/${selectedVariantId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((templates: FrameTemplate[]) => {
        const template = templates[0] ?? null;
        setCurrentTemplate(template);
        setMockupUrl(template?.mockupUrl ?? '');
        setMaskUrl(template?.maskUrl ?? '');
        setOverlayUrl(template?.overlayUrl ?? '');
        setTextZones(template?.textZones ?? []);
        setClipartOptions(template?.clipartOptions ?? []);
      })
      .finally(() => setLoadingTemplate(false));
  }, [selectedVariantId]);

  const updateTextZone = (index: number, patch: Partial<TextZone>) =>
    setTextZones((prev) => prev.map((z, i) => (i === index ? { ...z, ...patch } : z)));
  const updateClipart = (index: number, patch: Partial<ClipartOption>) =>
    setClipartOptions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const handleSave = () => {
    const nextVersion = (currentTemplate?.version ?? 0) + 1;
    setSaveNote(
      `Would create FrameTemplate version ${nextVersion} for this variant and mark it current (locally only — not yet persisted; see the backend requirements doc for the write path needed).`
    );
  };

  if (loadingVariants) return <p>Loading…</p>;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <Link href={`/admin/products/${productId}`} className="text-sm text-brown/60 hover:text-brown-dark w-fit">
        ← Back to product
      </Link>
      <h1 className="font-display text-2xl text-brown-dark">Personalization Template</h1>

      <div className="rounded-lg bg-gold/10 border border-gold/30 px-4 py-3 text-sm text-brown/80">
        Not yet connected to the backend — there is currently no frame-template write API. Saving here would create
        a new version doc, never edit the current one in place, so existing orders keep re-rendering against the
        exact version they were built with.
      </div>

      <label htmlFor="variant-select" className="text-sm text-brown/70">Variant</label>
      <select
        id="variant-select"
        value={selectedVariantId}
        onChange={(e) => setSelectedVariantId(e.target.value)}
        className="rounded-lg border border-gold/30 px-3 py-2 w-fit"
      >
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.sku} — {v.sizeLabel} / {v.frameColour}
          </option>
        ))}
      </select>

      {loadingTemplate ? (
        <p>Loading template…</p>
      ) : (
        <>
          {currentTemplate && (
            <p className="text-xs text-brown/60">
              Current version: {currentTemplate.version} {currentTemplate.isCurrent ? '(current)' : ''}
            </p>
          )}

          <label htmlFor="mockup-url" className="text-sm text-brown/70">Mockup URL</label>
          <input id="mockup-url" value={mockupUrl} onChange={(e) => setMockupUrl(e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

          <label htmlFor="mask-url" className="text-sm text-brown/70">Mask URL (optional — irregular photo-slot shape)</label>
          <input id="mask-url" value={maskUrl} onChange={(e) => setMaskUrl(e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

          <label htmlFor="overlay-url" className="text-sm text-brown/70">Overlay URL (optional — drawn on top of everything)</label>
          <input id="overlay-url" value={overlayUrl} onChange={(e) => setOverlayUrl(e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

          <section className="rounded-xl border border-gold/30 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-brown-dark">Text zones</h2>
              <button
                type="button"
                onClick={() => setTextZones((prev) => [...prev, blankTextZone()])}
                className="text-sm underline text-brown"
              >
                + Add zone
              </button>
            </div>
            {textZones.length === 0 && <p className="text-sm text-brown/60">No text personalization for this variant.</p>}
            {textZones.map((zone, index) => (
              <div key={index} className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-gold/20 pt-3">
                <input aria-label="Field key" placeholder="fieldKey" value={zone.fieldKey} onChange={(e) => updateTextZone(index, { fieldKey: e.target.value })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Label" placeholder="Label" value={zone.label} onChange={(e) => updateTextZone(index, { label: e.target.value })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Max length" type="number" placeholder="Max length" value={zone.maxLength} onChange={(e) => updateTextZone(index, { maxLength: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <select aria-label="Align" value={zone.align} onChange={(e) => updateTextZone(index, { align: e.target.value as TextZone['align'] })} className="rounded border border-gold/30 px-2 py-1 text-sm">
                  <option value="left">left</option>
                  <option value="center">center</option>
                  <option value="right">right</option>
                </select>
                <input aria-label="X" type="number" step="0.01" placeholder="x" value={zone.x} onChange={(e) => updateTextZone(index, { x: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Y" type="number" step="0.01" placeholder="y" value={zone.y} onChange={(e) => updateTextZone(index, { y: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Width" type="number" step="0.01" placeholder="width" value={zone.width} onChange={(e) => updateTextZone(index, { width: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Height" type="number" step="0.01" placeholder="height" value={zone.height} onChange={(e) => updateTextZone(index, { height: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <button
                  type="button"
                  onClick={() => setTextZones((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-2 sm:col-span-4 text-xs text-red-600 underline w-fit"
                >
                  Remove zone
                </button>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-gold/30 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-brown-dark">Clipart options</h2>
              <button
                type="button"
                onClick={() => setClipartOptions((prev) => [...prev, blankClipartOption()])}
                className="text-sm underline text-brown"
              >
                + Add clipart
              </button>
            </div>
            {clipartOptions.length === 0 && <p className="text-sm text-brown/60">No clipart offered for this variant.</p>}
            {clipartOptions.map((option, index) => (
              <div key={index} className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-gold/20 pt-3">
                <input aria-label="Clipart id" placeholder="id" value={option.id} onChange={(e) => updateClipart(index, { id: e.target.value })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Clipart label" placeholder="Label" value={option.label} onChange={(e) => updateClipart(index, { label: e.target.value })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Asset URL" placeholder="/clipart/heart.svg" value={option.assetUrl} onChange={(e) => updateClipart(index, { assetUrl: e.target.value })} className="col-span-2 rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Clipart X" type="number" step="0.01" placeholder="x" value={option.x} onChange={(e) => updateClipart(index, { x: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Clipart Y" type="number" step="0.01" placeholder="y" value={option.y} onChange={(e) => updateClipart(index, { y: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Clipart width" type="number" step="0.01" placeholder="width" value={option.width} onChange={(e) => updateClipart(index, { width: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <input aria-label="Clipart height" type="number" step="0.01" placeholder="height" value={option.height} onChange={(e) => updateClipart(index, { height: Number(e.target.value) })} className="rounded border border-gold/30 px-2 py-1 text-sm" />
                <button
                  type="button"
                  onClick={() => setClipartOptions((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-2 sm:col-span-4 text-xs text-red-600 underline w-fit"
                >
                  Remove clipart
                </button>
              </div>
            ))}
          </section>

          <button onClick={handleSave} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-6 py-2 w-fit">
            Save as new version
          </button>
          {saveNote && <p className="text-sm text-brown/70">{saveNote}</p>}
        </>
      )}
    </div>
  );
}
