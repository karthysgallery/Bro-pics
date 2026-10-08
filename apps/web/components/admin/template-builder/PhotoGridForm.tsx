'use client';

import { useState } from 'react';

/** "Add a photo grid": a mosaic of small photo spaces across the design, under the existing photos. */
export function PhotoGridForm({ onAdd }: { onAdd: (options: { columns: number; rows: number; gap: number }) => void }) {
  const [columns, setColumns] = useState(8);
  const [rows, setRows] = useState(10);
  const [gapPct, setGapPct] = useState(0.4);
  const field = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink outline-none focus:border-ink';
  const label = 'text-2xs font-semibold uppercase tracking-wide text-ink/55';
  return (
    <details className="rounded-lg bg-tint px-2.5 py-2 text-xs text-ink">
      <summary className="cursor-pointer font-semibold">Add a photo grid (mosaic)</summary>
      <p className="mt-1.5 text-ink/60">
        Fills the design with small photo spaces, under the photos already here. Put a main photo with “Remove the photo&apos;s background” on top for a cut-out
        over a mosaic.
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className={label}>Across</span>
          <input type="number" min={1} max={30} value={columns} onChange={(e) => setColumns(Number(e.target.value) || 1)} className={field} />
        </label>
        <label className="block space-y-1">
          <span className={label}>Down</span>
          <input type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)} className={field} />
        </label>
        <label className="block space-y-1">
          <span className={label}>Gap (%)</span>
          <input type="number" min={0} max={5} step={0.1} value={gapPct} onChange={(e) => setGapPct(Math.max(0, Number(e.target.value) || 0))} className={field} />
        </label>
      </div>
      <button
        type="button"
        onClick={() => onAdd({ columns, rows, gap: gapPct / 100 })}
        className="mt-2 rounded-lg border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-paper"
      >
        Add {columns * rows} photo spaces
      </button>
    </details>
  );
}
