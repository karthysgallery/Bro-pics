'use client';

import { useState } from 'react';
import type { FrameModel } from '@bro-pics/shared';
import { useAdminApi } from '../../template-builder/use-admin-api';
import { useCatalogueUpload } from '../use-catalogue-upload';
import { makeProductPhotos } from '../product-photos';
import { SAMPLE_PHOTO, lookOf } from '../FramedPreview';
import { latestDesign, renderCollagePicture } from '../collage-picture';
import { remakeShopPhotos, type RemakeDeps } from './remake-photos';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  /** The products in the list, in list order. */
  products: Array<{ id: string; title: string }>;
  onDone: () => void;
}

type Line = { id: string; title: string; text: string; tone: 'muted' | 'ok' | 'warn' | 'error' };

/**
 * "Make framed shop photos": gives every listed product the framed card photo (and the other automatic shop
 * photos) the editor makes on save. Products whose photos are already up to date are left alone.
 */
export function RemakePhotosButton({ products, onDone }: Props) {
  const api = useAdminApi();
  const upload = useCatalogueUpload();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  const setLine = (line: Line) => setLines((ls) => [...ls.filter((l) => l.id !== line.id), line]);

  const run = async () => {
    setRunning(true);
    setLines([]);
    try {
      const options = await api<{ frameModels: FrameModel[] }>('/api/admin/products/setup/options');
      const models = new Map(options.frameModels.map((m) => [m.id, m]));
      const deps: RemakeDeps = { api, upload, makePhotos: makeProductPhotos, lookOf, renderCollage: (d, s) => renderCollagePicture(d, s), latestDesign, samplePhoto: SAMPLE_PHOTO, sleep };
      for (const p of products) {
        setCurrent(p.title);
        setLine({ id: p.id, title: p.title, text: 'Checking…', tone: 'muted' });
        try {
          const r = await remakeShopPhotos(deps, p.id, models, (text) => setLine({ id: p.id, title: p.title, text, tone: 'muted' }));
          if (r.status === 'made') setLine({ id: p.id, title: p.title, text: `Done — ${r.photos} photos, framed photo on the shop card`, tone: 'ok' });
          else if (r.status === 'up-to-date') setLine({ id: p.id, title: p.title, text: 'Already has its framed photos', tone: 'muted' });
          else setLine({ id: p.id, title: p.title, text: `Skipped: ${r.reason}`, tone: 'warn' });
        } catch (e) {
          setLine({ id: p.id, title: p.title, text: e instanceof Error ? e.message : 'Failed', tone: 'error' });
        }
      }
    } catch (e) {
      setLines((ls) => [...ls, { id: '_', title: 'Could not start', text: e instanceof Error ? e.message : 'Failed', tone: 'error' }]);
    } finally {
      setCurrent(null);
      setRunning(false);
      onDone();
    }
  };

  const made = lines.filter((l) => l.tone === 'ok').length;
  const failed = lines.filter((l) => l.tone === 'error').length;
  const TONE = { muted: 'text-ink/55', ok: 'text-emerald-700', warn: 'text-amber-700', error: 'text-alert' } as const;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={products.length === 0}
        className="px-4 py-2 rounded-xl border border-line bg-paper hover:bg-tint text-ink font-semibold text-xs transition-colors disabled:opacity-40"
      >
        Make framed shop photos
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="remake-title">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-paper p-5 shadow-xl">
            <h2 id="remake-title" className="text-base font-bold text-ink">Make framed shop photos</h2>
            <p className="mt-1 text-sm text-ink/70">
              For each of the {products.length} products in the list, draws the picture in its frame (the shop card photo), the sizes, a frame
              close-up, a wall view and the picture itself — the same photos the editor makes when you save. Products that already have
              up-to-date photos are left alone, and your own photos are kept after the new ones.
            </p>
            {lines.length > 0 && (
              <ul className="mt-4 flex-1 space-y-1 overflow-y-auto rounded-xl border border-line p-3 text-xs" aria-live="polite">
                {lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="truncate font-medium text-ink">{l.title}</span>
                    <span className={`shrink-0 text-right ${TONE[l.tone]}`}>{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink/60" aria-live="polite">
              {running
                ? `Working on ${current ?? '…'} (${lines.length} of ${products.length}). Keep this tab open.`
                : lines.length > 0
                  ? `Finished: ${made} updated${failed ? `, ${failed} failed (run again to retry them)` : ''}.`
                  : 'Takes about 10–20 seconds per product.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={running} onClick={() => setOpen(false)} className="h-9 rounded-xl px-3 text-xs font-semibold text-ink/70 disabled:opacity-40">
                {lines.length > 0 && !running ? 'Close' : 'Cancel'}
              </button>
              {!(lines.length > 0 && !running && failed === 0) && (
                <button type="button" disabled={running} onClick={() => void run()} className="h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-paper disabled:opacity-40">
                  {running ? 'Working…' : lines.length > 0 ? 'Run again' : `Start (${products.length} products)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
