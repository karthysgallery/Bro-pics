'use client';

import { useState } from 'react';
import {
  STANDARD_FRAME_SIZES,
  orientSize,
  artworkDpi,
  checkPriceRows,
  discountPercent,
  marginPercent,
  sizeLabelOf,
  suggestMakingCost,
  type FrameModel,
  type FramingCostRates,
} from '@bro-pics/shared';
import { inr, rupees, toPaise } from './use-catalogue-upload';

export interface EditorRow {
  key: string;
  variantId?: string;
  widthIn: number;
  heightIn: number;
  frameModelId: string | null;
  legacyFinish?: string | null;
  mrp: number;
  price: number;
  cost: number;
  isActive: boolean;
}

const sizeKey = (r: { widthIn: number; heightIn: number }) => `${r.widthIn}x${r.heightIn}`;
let seq = 0;
export const newRowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const money = 'h-9 w-full rounded-lg border border-line bg-paper pl-5 pr-1.5 text-right text-xs tabular-nums text-ink outline-none focus:border-ink';

function MoneyInput({ value, onChange, label, invalid }: { value: number; onChange: (paise: number) => void; label: string; invalid?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-2xs text-ink/45">₹</span>
      <input
        aria-label={label}
        inputMode="decimal"
        className={`${money} ${invalid ? 'border-alert bg-red-50' : ''}`}
        value={text ?? (value ? rupees(value) : '')}
        placeholder="0"
        onFocus={(e) => {
          setText(value ? rupees(value) : '');
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toPaise(e.target.value));
        }}
        onBlur={() => setText(null)}
      />
    </div>
  );
}

function DpiChip({ dpi }: { dpi: number }) {
  const tone = dpi >= 250 ? 'bg-emerald-50 text-emerald-800' : dpi >= 150 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-alert';
  const text = dpi >= 250 ? 'Sharp' : dpi >= 150 ? 'Good' : 'Too soft';
  return <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${tone}`} title={`${dpi} pixels per inch at this size`}>{text} · {dpi} ppi</span>;
}

/**
 * Sizes × frame models. One line per (size, frame model): MRP, selling price,
 * private making cost, with margin and customer discount worked out live.
 */
export function PricingGrid({
  rows,
  onChange,
  models,
  selectedModelIds,
  rates,
  artwork,
  onPickModel,
}: {
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
  models: FrameModel[];
  selectedModelIds: string[];
  rates: FramingCostRates;
  artwork: { widthPx: number; heightPx: number } | null;
  /** An older line was given a frame model (which may not be ticked yet). */
  onPickModel: (rowKey: string, modelId: string) => void;
}) {
  const [custom, setCustom] = useState({ w: '', h: '' });
  // Which way the frames hang: the shop's sizes are named long side first (12×8); portrait stores them as 8 wide × 12 high.
  const fromRows = rows.find((r) => r.widthIn !== r.heightIn);
  const fallback: 'landscape' | 'portrait' = artwork && artwork.heightPx > artwork.widthPx ? 'portrait' : 'landscape';
  const [orientationChoice, setOrientationChoice] = useState<'landscape' | 'portrait' | null>(null);
  const orientation = orientationChoice ?? (fromRows ? (fromRows.widthIn > fromRows.heightIn ? 'landscape' : 'portrait') : fallback);
  /** Turns every size line the other way (same lines, so saved sizes keep their ids). */
  const turnAll = (next: 'landscape' | 'portrait') => {
    setOrientationChoice(next);
    onChange(rows.map((r) => ({ ...r, ...orientSize(r, next) })));
  };
  const byId = new Map(models.map((m) => [m.id, m]));
  const selectedModels = selectedModelIds.map((id) => byId.get(id)).filter((m): m is FrameModel => Boolean(m));
  const sizes = [...new Map(rows.map((r) => [sizeKey(r), { widthIn: r.widthIn, heightIn: r.heightIn }])).values()].sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn);
  const problems = checkPriceRows(rows.map((r) => ({ ...r, frameModelId: r.frameModelId ?? '' })));
  const problemFor = (i: number) => problems.filter((p) => p.index === i);

  const update = (key: string, patch: Partial<EditorRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Price for a new line: the same size's first-model price moved by this model's price change. */
  const prefill = (size: { widthIn: number; heightIn: number }, model: FrameModel) => {
    const base = rows.find((r) => sizeKey(r) === sizeKey(size) && r.frameModelId === selectedModelIds[0]);
    const first = byId.get(selectedModelIds[0] ?? '');
    const delta = model.priceDelta - (first?.priceDelta ?? 0);
    return {
      mrp: base?.mrp ? Math.max(0, base.mrp + delta) : 0,
      price: base?.price ? Math.max(0, base.price + delta) : 0,
      cost: suggestMakingCost(size, model, rates),
    };
  };

  const addSize = (size: { widthIn: number; heightIn: number }) => {
    if (sizes.some((s) => sizeKey(s) === sizeKey(size))) return;
    const fresh = selectedModels.map((m) => ({ key: newRowKey(), widthIn: size.widthIn, heightIn: size.heightIn, frameModelId: m.id, mrp: 0, price: 0, cost: suggestMakingCost(size, m, rates), isActive: true }));
    onChange([...rows, ...fresh]);
  };
  const removeSize = (size: { widthIn: number; heightIn: number }) => onChange(rows.filter((r) => sizeKey(r) !== sizeKey(size)));

  const addCustom = () => {
    const w = Number(custom.w);
    const h = Number(custom.h);
    if (w >= 2 && h >= 2 && w <= 96 && h <= 96) {
      addSize({ widthIn: w, heightIn: h });
      setCustom({ w: '', h: '' });
    }
  };

  const fillOthers = () =>
    onChange(
      rows.map((r) => {
        if (r.frameModelId === selectedModelIds[0] || (r.price && r.mrp)) return r;
        const m = byId.get(r.frameModelId ?? '');
        if (!m) return r;
        const p = prefill(r, m);
        return { ...r, mrp: r.mrp || p.mrp, price: r.price || p.price };
      })
    );
  const suggestCosts = () => onChange(rows.map((r) => ({ ...r, cost: suggestMakingCost(r, byId.get(r.frameModelId ?? '') ?? null, rates) })));

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-2xs font-bold uppercase tracking-wider text-ink/60">Sizes you sell (inches)</p>
          <div role="group" aria-label="Which way the frame hangs" className="inline-flex rounded-full border border-line p-0.5 text-2xs font-semibold">
            {(['landscape', 'portrait'] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={orientation === o}
                onClick={() => turnAll(o)}
                className={`h-7 rounded-full px-3 capitalize ${orientation === o ? 'bg-ink text-paper' : 'text-ink/65 hover:text-ink'}`}
              >
                {o === 'landscape' ? '▭ Landscape' : '▯ Portrait'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_FRAME_SIZES.map((standard) => {
            const s = orientSize(standard, orientation);
            const on = sizes.some((x) => sizeKey(x) === sizeKey(s));
            return (
              <button
                key={sizeKey(standard)}
                type="button"
                aria-pressed={on}
                title={`${s.widthIn} wide × ${s.heightIn} high`}
                onClick={() => (on ? removeSize(s) : addSize(s))}
                className={`h-8 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink/75 hover:border-ink/40'}`}
              >
                {standard.widthIn}×{standard.heightIn}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line pl-3 pr-1">
            <input aria-label="Custom width" inputMode="decimal" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} placeholder="W" className="h-7 w-9 bg-transparent text-center text-xs outline-none" />
            <span className="text-2xs text-ink/40">×</span>
            <input aria-label="Custom height" inputMode="decimal" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addCustom()} placeholder="H" className="h-7 w-9 bg-transparent text-center text-xs outline-none" />
            <button type="button" onClick={addCustom} className="h-6 rounded-full bg-field px-2 text-2xs font-semibold text-ink hover:bg-tint">
              Add
            </button>
          </span>
        </div>
        {selectedModels.length === 0 && <p className="mt-2 text-2xs text-amber-700">Choose frame models above first — each size gets one price line per frame model.</p>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {selectedModels.length > 1 && (
              <button type="button" onClick={fillOthers} className="h-8 rounded-lg border border-line px-3 text-2xs font-semibold text-ink hover:bg-field">
                Fill other frames from {selectedModels[0]!.name}
              </button>
            )}
            <button type="button" onClick={suggestCosts} className="h-8 rounded-lg border border-line px-3 text-2xs font-semibold text-ink hover:bg-field">
              Suggest all making costs
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-line bg-field/70 text-left text-2xs uppercase tracking-wider text-ink/55">
                  <th className="px-3 py-2">Frame model</th>
                  <th className="w-28 px-2 py-2 text-right">MRP</th>
                  <th className="w-28 px-2 py-2 text-right">Selling price</th>
                  <th className="w-28 px-2 py-2 text-right">Making cost</th>
                  <th className="w-20 px-2 py-2 text-right">Margin</th>
                  <th className="w-16 px-2 py-2 text-right">Off</th>
                  <th className="w-16 px-2 py-2 text-center">Sell</th>
                </tr>
              </thead>
              {sizes.map((size) => {
                const group = rows.map((r, index) => ({ r, index })).filter(({ r }) => sizeKey(r) === sizeKey(size));
                return (
                  <tbody key={sizeKey(size)} className="border-b border-line last:border-b-0">
                    <tr className="bg-paper">
                      <td colSpan={7} className="px-3 pb-1 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold tabular-nums text-ink">{sizeLabelOf(size.widthIn, size.heightIn)}</span>
                          <span className="text-2xs text-ink/50">{size.widthIn > size.heightIn ? 'landscape' : size.widthIn === size.heightIn ? 'square' : 'portrait'}</span>
                          {artwork && <DpiChip dpi={artworkDpi({ width: artwork.widthPx, height: artwork.heightPx }, size)} />}
                          <button type="button" onClick={() => removeSize(size)} className="ml-auto text-2xs font-semibold text-alert hover:underline">
                            Remove size
                          </button>
                        </div>
                      </td>
                    </tr>
                    {group.map(({ r, index }) => {
                      const m = byId.get(r.frameModelId ?? '');
                      const margin = marginPercent(r.price, r.cost);
                      const off = discountPercent(r.mrp, r.price);
                      const issues = problemFor(index);
                      return (
                        <tr key={r.key} className={r.isActive ? '' : 'opacity-50'}>
                          <td className="px-3 py-1.5">
                            {m ? (
                              <span className="flex items-center gap-2">
                                <span className="h-4 w-4 shrink-0 rounded-sm border border-ink/15" style={{ backgroundColor: m.colourHex }} />
                                <span className="font-semibold text-ink">{m.name}</span>
                              </span>
                            ) : (
                              <select
                                aria-label="Frame model for this size"
                                className="h-8 rounded-lg border border-alert bg-red-50 px-2 text-xs"
                                value=""
                                onChange={(e) => e.target.value && onPickModel(r.key, e.target.value)}
                              >
                                <option value="">{r.legacyFinish ? `Old finish “${r.legacyFinish}” → choose…` : 'Choose frame model…'}</option>
                                {models.filter((sm) => sm.isActive || selectedModelIds.includes(sm.id)).map((sm) => (
                                  <option key={sm.id} value={sm.id}>
                                    {sm.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {issues.map((p) => (
                              <span key={p.message} className={`mt-0.5 block text-2xs ${p.severity === 'error' ? 'text-alert' : 'text-amber-700'}`}>
                                {p.message}
                              </span>
                            ))}
                          </td>
                          <td className="px-2 py-1.5">
                            <MoneyInput label={`MRP ${sizeLabelOf(r.widthIn, r.heightIn)} ${m?.name ?? ''}`} value={r.mrp} onChange={(mrp) => update(r.key, { mrp })} invalid={r.isActive && !r.mrp} />
                          </td>
                          <td className="px-2 py-1.5">
                            <MoneyInput label={`Selling price ${sizeLabelOf(r.widthIn, r.heightIn)} ${m?.name ?? ''}`} value={r.price} onChange={(price) => update(r.key, { price })} invalid={r.isActive && (!r.price || r.price > r.mrp)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <MoneyInput label={`Making cost ${sizeLabelOf(r.widthIn, r.heightIn)} ${m?.name ?? ''}`} value={r.cost} onChange={(cost) => update(r.key, { cost })} />
                              <button
                                type="button"
                                title={`Suggest: ${inr(suggestMakingCost(r, m ?? null, rates))}`}
                                aria-label="Suggest making cost"
                                onClick={() => update(r.key, { cost: suggestMakingCost(r, m ?? null, rates) })}
                                className="h-8 w-7 shrink-0 rounded-md text-ink/45 hover:bg-field hover:text-ink"
                              >
                                ↺
                              </button>
                            </div>
                          </td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${margin === null ? 'text-ink/40' : margin < 0 ? 'font-bold text-alert' : margin < 20 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {margin === null || !r.cost ? '—' : `${margin}%`}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">{off ? `${off}%` : '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            {!r.variantId && (
                              <button type="button" aria-label={`Remove line ${sizeLabelOf(r.widthIn, r.heightIn)} ${m?.name ?? ''}`} title="Remove this line (not saved yet)" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} className="mr-1 text-ink/35 hover:text-alert">
                                ×
                              </button>
                            )}
                            <input type="checkbox" aria-label={`Sell ${sizeLabelOf(r.widthIn, r.heightIn)} ${m?.name ?? ''}`} checked={r.isActive} onChange={(e) => update(r.key, { isActive: e.target.checked })} className="h-4 w-4 accent-[#1a1a1a]" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
          {problems.some((p) => p.index === -1) && <p className="text-2xs text-alert">{problems.find((p) => p.index === -1)!.message}</p>}
          <p className="text-2xs text-ink/50">Making cost and margin are private. Customers see the MRP struck through and the selling price.</p>
        </>
      )}
    </div>
  );
}

/**
 * Lines for newly selected frame models (for every size already in the grid), and without removed ones.
 * `finishOf` maps a model to the old finish the owner chose it for, so every size's matching old line is claimed.
 */
export function syncRowsWithModels(rows: EditorRow[], modelIds: string[], models: FrameModel[], rates: FramingCostRates, finishOf: Record<string, string> = {}): EditorRow[] {
  const byId = new Map(models.map((m) => [m.id, m]));
  const kept = rows.filter((r) => r.frameModelId === null || modelIds.includes(r.frameModelId)).map((r) => ({ ...r }));
  const sizes = [...new Map(kept.map((r) => [sizeKey(r), { widthIn: r.widthIn, heightIn: r.heightIn }])).values()];
  const first = byId.get(modelIds[0] ?? '');
  const out = [...kept];
  for (const id of modelIds) {
    const m = byId.get(id);
    if (!m) continue;
    for (const s of sizes) {
      if (out.some((r) => sizeKey(r) === sizeKey(s) && r.frameModelId === id)) continue;
      // An older line of this size without a model is claimed first (keeping its variant id, so carts and
      // past orders keep working): the one whose old finish names this model, or the only one there is.
      const unassigned = out.filter((r) => sizeKey(r) === sizeKey(s) && r.frameModelId === null);
      const finish = (r: EditorRow) => (r.legacyFinish ?? '').trim().toLowerCase();
      const alias = finishOf[id]?.trim().toLowerCase();
      const claim = unassigned.find((r) => finish(r) && (finish(r) === alias || finish(r) === m.name.toLowerCase() || finish(r) === m.colour.toLowerCase())) ?? (unassigned.length === 1 ? unassigned[0] : undefined);
      if (claim) {
        claim.frameModelId = id;
        continue;
      }
      const base = out.find((r) => sizeKey(r) === sizeKey(s) && r.frameModelId === modelIds[0]);
      const delta = m.priceDelta - (first?.priceDelta ?? 0);
      out.push({
        key: newRowKey(),
        widthIn: s.widthIn,
        heightIn: s.heightIn,
        frameModelId: id,
        mrp: base?.mrp ? Math.max(0, base.mrp + delta) : 0,
        price: base?.price ? Math.max(0, base.price + delta) : 0,
        cost: suggestMakingCost(s, m, rates),
        isActive: true,
      });
    }
  }
  return out;
}
