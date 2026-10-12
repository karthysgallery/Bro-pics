'use client';

import { useMemo, useState } from 'react';
import { PriceListInputSchema, STANDARD_FRAME_SIZES, paperSizeName, sizeLabelOf, type FrameModel, type PriceList, type PriceListRow } from '@bro-pics/shared';
import { useAdminApi } from '../../template-builder/use-admin-api';
import { useToast } from '../../../ui/Toast';
import { rupees, toPaise } from '../use-catalogue-upload';

interface Line {
  key: number;
  longIn: number;
  shortIn: number;
  frameModelId: string;
  mrp: string;
  price: string;
  isActive: boolean;
}

const field = 'h-9 rounded-lg border border-line bg-paper px-2 text-xs text-ink outline-none focus:border-ink';
let seq = 0;
const toLine = (r: PriceListRow): Line => ({ key: seq++, longIn: r.longIn, shortIn: r.shortIn, frameModelId: r.frameModelId, mrp: r.mrp ? rupees(r.mrp) : '', price: r.price ? rupees(r.price) : '', isActive: r.isActive });

/** Make or edit one price list: the sizes × frame models and prices reused for every picture in a bulk upload. */
export function PriceListEditor({
  models,
  list,
  onSaved,
  onDeleted,
  onClose,
}: {
  models: FrameModel[];
  list: PriceList | null;
  onSaved: (list: PriceList) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const api = useAdminApi();
  const { showToast } = useToast();
  const active = useMemo(() => models.filter((m) => m.isActive), [models]);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const [name, setName] = useState(list?.name ?? '');
  const [lines, setLines] = useState<Line[]>(() => (list ? list.rows.map(toLine) : []));
  const [addModel, setAddModel] = useState(active[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const has = (long: number, short: number, model: string) => lines.some((l) => l.longIn === long && l.shortIn === short && l.frameModelId === model);
  const toggleSize = (long: number, short: number) => {
    if (!addModel) return;
    if (has(long, short, addModel)) setLines((ls) => ls.filter((l) => !(l.longIn === long && l.shortIn === short && l.frameModelId === addModel)));
    else setLines((ls) => [...ls, { key: seq++, longIn: long, shortIn: short, frameModelId: addModel, mrp: '', price: '', isActive: true }]);
  };

  const sorted = [...lines].sort((a, b) => a.longIn * a.shortIn - b.longIn * b.shortIn || a.frameModelId.localeCompare(b.frameModelId));

  const save = async () => {
    const rows = lines.map((l) => ({ longIn: l.longIn, shortIn: l.shortIn, frameModelId: l.frameModelId, mrp: toPaise(l.mrp), price: toPaise(l.price), isActive: l.isActive }));
    const parsed = PriceListInputSchema.safeParse({ name, rows });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const row = issue?.path[0] === 'rows' && typeof issue.path[1] === 'number' ? rows[issue.path[1]] : undefined;
      setError(row ? `${sizeLabelOf(row.longIn, row.shortIn)} · ${byId.get(row.frameModelId)?.name ?? 'frame'}: ${issue!.message}` : issue?.message ?? 'Check the price list.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ priceList: PriceList }>(list ? `/api/admin/price-lists/${list.id}` : '/api/admin/price-lists', { method: list ? 'PUT' : 'POST', body: JSON.stringify(parsed.data) });
      showToast('Price list saved', 'success');
      onSaved(r.priceList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The price list could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!list || !window.confirm(`Delete the price list “${list.name}”? Products already made from it keep their prices.`)) return;
    try {
      await api(`/api/admin/price-lists/${list.id}`, { method: 'DELETE' });
      showToast('Price list deleted', 'success');
      onDeleted(list.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The price list could not be deleted.');
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gold/40 bg-paper p-4" role="group" aria-label="Price list">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-2xs font-bold uppercase tracking-wider text-ink/60">
          Price list name
          <input className={`${field} mt-1 h-10 w-full text-sm`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Devotional frames" maxLength={60} />
        </label>
        <button type="button" onClick={onClose} className="h-10 rounded-xl px-3 text-sm font-semibold text-ink/70 hover:bg-field">
          Close
        </button>
      </div>

      <div>
        <p className="mb-1 text-2xs font-bold uppercase tracking-wider text-ink/60">Add sizes for this frame model</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Frame model to add sizes for" className={`${field} h-8`} value={addModel} onChange={(e) => setAddModel(e.target.value)}>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {STANDARD_FRAME_SIZES.map((s) => {
            const long = Math.max(s.widthIn, s.heightIn);
            const short = Math.min(s.widthIn, s.heightIn);
            const on = has(long, short, addModel);
            const paper = paperSizeName(s);
            return (
              <button
                key={`${long}x${short}`}
                type="button"
                aria-pressed={on}
                aria-label={`${long}×${short}`}
                onClick={() => toggleSize(long, short)}
                className={`h-8 rounded-full border px-3 text-xs font-semibold tabular-nums ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink/75 hover:border-ink/40'}`}
              >
                {long}×{short}
                {paper && <span className={`ml-1 text-2xs font-bold ${on ? 'text-gold' : 'text-ink/40'}`}>{paper}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-2xs text-ink/50">Sizes are written long side first. A portrait picture hangs them the other way round automatically.</p>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-line bg-field/70 text-left text-2xs uppercase tracking-wider text-ink/55">
                <th className="px-3 py-2">Size</th>
                <th className="px-2 py-2">Frame model</th>
                <th className="w-28 px-2 py-2 text-right">MRP ₹</th>
                <th className="w-28 px-2 py-2 text-right">Selling ₹</th>
                <th className="w-14 px-2 py-2 text-center">Sell</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => {
                const label = `${sizeLabelOf(l.longIn, l.shortIn)} ${byId.get(l.frameModelId)?.name ?? l.frameModelId}`;
                return (
                  <tr key={l.key} className={`border-b border-line/60 last:border-0 ${l.isActive ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-1.5 font-semibold tabular-nums text-ink">
                      {l.longIn}×{l.shortIn}
                      {paperSizeName({ widthIn: l.longIn, heightIn: l.shortIn }) && <span className="ml-1.5 rounded bg-tint px-1.5 py-0.5 text-2xs font-bold text-ink/70">{paperSizeName({ widthIn: l.longIn, heightIn: l.shortIn })}</span>}
                    </td>
                    <td className="px-2 py-1.5">{byId.get(l.frameModelId)?.name ?? <span className="text-alert">Removed frame model</span>}</td>
                    <td className="px-2 py-1.5">
                      <input aria-label={`MRP ${label}`} inputMode="decimal" className={`${field} w-full text-right tabular-nums`} value={l.mrp} onChange={(e) => update(l.key, { mrp: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label={`Selling price ${label}`} inputMode="decimal" className={`${field} w-full text-right tabular-nums`} value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" aria-label={`Sell ${label}`} checked={l.isActive} onChange={(e) => update(l.key, { isActive: e.target.checked })} className="h-4 w-4 accent-[#1a1a1a]" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" aria-label={`Remove ${label}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-ink/40 hover:text-alert">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-50">
          {saving ? 'Saving…' : list ? 'Save price list' : 'Create price list'}
        </button>
        {list && (
          <button type="button" onClick={() => void remove()} className="h-10 rounded-xl px-3 text-sm font-semibold text-alert hover:bg-red-50">
            Delete this list
          </button>
        )}
      </div>
    </div>
  );
}
