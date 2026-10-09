'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useToast } from '../ui/Toast';

interface ItemFiles {
  itemId: string;
  preview: boolean;
  print: { available: boolean; jobStatus: string | null; jobError: string | null };
  originals: Array<{ uploadId: string; label: string; widthPx: number | null; heightPx: number | null; available: boolean }>;
}

type DownloadType = 'preview' | 'original' | 'print';

const btn = 'rounded-lg border border-line bg-paper px-2.5 py-1.5 text-2xs font-semibold text-ink transition-colors hover:bg-field disabled:opacity-50';
const primaryBtn = 'rounded-lg bg-gold px-2.5 py-1.5 text-2xs font-bold text-ink transition-colors hover:bg-gold-deep disabled:opacity-50';

/** Why a print-ready file is missing, in words staff can act on. */
export function printStatusText(print: ItemFiles['print']): string {
  if (print.available) return 'Ready to print';
  switch (print.jobStatus) {
    case null:
      return 'Not rendered yet — the print service has not picked this item up.';
    case 'queued':
      return 'Waiting to be rendered.';
    case 'rendering':
      return 'Rendering now…';
    case 'failed':
      return `Rendering failed and will retry${print.jobError ? `: ${print.jobError}` : '.'}`;
    case 'failed_permanent':
      return `Rendering failed for good${print.jobError ? `: ${print.jobError}` : '.'} Use "Render again", or redesign by hand from the original photos.`;
    default:
      return `Print job: ${print.jobStatus}.`;
  }
}

/**
 * The three things staff need to produce an item: the preview the customer saw, their original photos
 * (to redesign by hand if the preview shows a problem), and the print-ready file (to print as is).
 */
export function ItemFilesBox({ orderId, itemId }: { orderId: string; itemId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [files, setFiles] = useState<ItemFiles | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const base = `/api/admin/orders/${orderId}/items/${itemId}`;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${base}/files`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Partial<ItemFiles> | null;
      // A page must never crash on an unexpected reply: anything that isn't the files shape counts as a failed load.
      if (!body || !Array.isArray(body.originals) || !body.print || typeof body.preview !== 'boolean') throw new Error('unexpected reply');
      setFiles(body as ItemFiles);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [user, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (type: DownloadType, uploadId?: string) => {
    if (!user) return;
    const key = `${type}:${uploadId ?? ''}`;
    setBusy(key);
    try {
      const token = await user.getIdToken();
      const query = new URLSearchParams({ type, ...(uploadId && { upload: uploadId }) });
      const res = await fetch(`${base}/download?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.url !== 'string') throw new Error(body?.error?.message ?? 'This file is not available yet.');
      // A link that saves the file under its proper name (the server asks storage for an attachment).
      const a = document.createElement('a');
      a.href = body.url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not download this file.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const renderAgain = async () => {
    if (!user) return;
    setBusy('render');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${base}/re-render`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? body?.error ?? 'Could not queue the render.');
      showToast('Queued to render again. Refresh in a minute.', 'success');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not queue the render.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (failed) {
    return (
      <p className="mt-2 text-2xs text-alert">
        Couldn&apos;t load the files for this item.{' '}
        <button type="button" onClick={() => void load()} className="underline">Try again</button>
      </p>
    );
  }
  if (!files) return <p className="mt-2 text-2xs text-ink/50">Loading files…</p>;

  return (
    <div className="mt-2 rounded-xl border border-line bg-field/50 p-3 text-2xs" data-testid="item-files">
      <p className="font-bold uppercase tracking-wider text-ink">Files</p>
      <div className="mt-2 grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink/80"><strong className="text-ink">Preview</strong> — exactly what the customer saw</span>
          <button type="button" className={btn} disabled={!files.preview || busy === 'preview:'} onClick={() => void download('preview')}>
            {files.preview ? 'Download preview' : 'No preview saved'}
          </button>
        </div>

        <div className="grid gap-1.5">
          <span className="text-ink/80"><strong className="text-ink">Original photos</strong> — the customer&apos;s uploads, untouched (use these to redesign by hand)</span>
          {files.originals.length === 0 ? (
            <span className="text-ink/50">No customer photos for this item (a ready-made frame has none).</span>
          ) : (
            files.originals.map((o) => (
              <div key={o.uploadId} className="flex flex-wrap items-center justify-between gap-2 pl-3">
                <span className="text-ink/80">
                  {o.label}
                  {o.widthPx && o.heightPx ? <span className="text-ink/50"> · {o.widthPx}×{o.heightPx} px</span> : null}
                </span>
                <button type="button" className={btn} disabled={!o.available || busy === `original:${o.uploadId}`} onClick={() => void download('original', o.uploadId)}>
                  {o.available ? 'Download original' : 'File missing'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink/80">
            <strong className="text-ink">Print-ready file</strong> — 300 DPI, printed artwork only
            <span className={`block ${files.print.available ? 'text-emerald-700' : 'text-ink/60'}`}>{printStatusText(files.print)}</span>
          </span>
          <span className="flex gap-1.5">
            {!files.print.available && files.print.jobStatus !== null && files.print.jobStatus !== 'rendering' && (
              <button type="button" className={btn} disabled={busy === 'render'} onClick={() => void renderAgain()}>
                {busy === 'render' ? 'Queuing…' : 'Render again'}
              </button>
            )}
            <button type="button" className={primaryBtn} disabled={!files.print.available || busy === 'print:'} onClick={() => void download('print')}>
              Download print-ready file
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
