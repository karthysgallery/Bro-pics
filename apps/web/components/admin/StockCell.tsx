'use client';

import { useState } from 'react';
import { useAdminApi } from './template-builder/use-admin-api';

type Mode = null | 'track' | 'restock' | 'set';

/**
 * Units on hand for one size, shared by the website and the store. "Made to
 * order" sizes are unlimited; switching on counting asks for today's count.
 */
export function StockCell({
  productId,
  variantId,
  trackStock,
  stockQty,
  onChanged,
}: {
  productId: string;
  variantId: string;
  trackStock: boolean;
  stockQty: number | null;
  onChanged: (next: { trackStock: boolean; stockQty: number | null }) => void;
}) {
  const api = useAdminApi();
  const [mode, setMode] = useState<Mode>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: 'track' | 'restock' | 'set' | 'untrack') => {
    setBusy(true);
    setError(null);
    try {
      const n = Number(qty);
      const res = await api<{ trackStock: boolean; stockQty: number }>('/api/admin/inventory/stock', {
        method: 'POST',
        body: JSON.stringify({ action, productId, variantId, ...(action !== 'untrack' && { qty: n }), ...(note.trim() && { note: note.trim() }) }),
      });
      onChanged({ trackStock: res.trackStock, stockQty: res.trackStock ? res.stockQty : null });
      setMode(null);
      setQty('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The stock could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'h-8 w-20 rounded-lg border border-line bg-paper px-2 text-xs text-ink';
  if (mode) {
    const label = mode === 'track' ? 'Units on hand now' : mode === 'restock' ? 'Units received' : 'Correct count';
    return (
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-1.5">
          <input aria-label={label} type="number" min={mode === 'restock' ? 1 : 0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={label} className={input} autoFocus />
          {mode === 'set' && <input aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (damage, recount)" className="h-8 w-44 rounded-lg border border-line bg-paper px-2 text-xs text-ink" />}
          <button type="button" disabled={busy || qty === '' || (mode === 'set' && !note.trim())} onClick={() => void submit(mode)} className="h-8 rounded-lg bg-ink px-2.5 text-2xs font-semibold text-paper disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setMode(null)} className="h-8 px-1.5 text-2xs text-ink/60">
            Cancel
          </button>
        </div>
        <span className="text-2xs text-ink/50">{label}</span>
        {error && <span className="text-2xs text-alert">{error}</span>}
      </div>
    );
  }
  if (!trackStock) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xs text-ink/55">Made to order</span>
        <button type="button" onClick={() => setMode('track')} className="rounded-lg border border-line px-2 py-1 text-2xs font-semibold text-ink hover:border-ink">
          Count stock
        </button>
        {error && <span className="text-2xs text-alert">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`min-w-14 font-mono text-sm font-bold ${stockQty !== null && stockQty <= 0 ? 'text-alert' : stockQty !== null && stockQty <= 3 ? 'text-amber-700' : 'text-ink'}`}>{stockQty ?? 0} on hand</span>
      <button type="button" onClick={() => setMode('restock')} className="rounded-lg border border-line px-2 py-1 text-2xs font-semibold text-ink hover:border-ink">
        Restock
      </button>
      <button type="button" onClick={() => setMode('set')} className="rounded-lg border border-line px-2 py-1 text-2xs font-semibold text-ink hover:border-ink">
        Correct
      </button>
      <button type="button" disabled={busy} onClick={() => void submit('untrack')} className="px-1 text-2xs text-ink/50 hover:text-ink" title="Back to made to order (unlimited)">
        Stop counting
      </button>
      {error && <span className="text-2xs text-alert">{error}</span>}
    </div>
  );
}
