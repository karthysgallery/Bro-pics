'use client';

import { useRef, useState } from 'react';
import { useAdminApi } from '../template-builder/use-admin-api';
import { useToast } from '../../ui/Toast';
import { useAuth } from '../../../lib/auth-context';
import { useCatalogueUpload } from './use-catalogue-upload';

interface StockPhoto {
  id: number;
  alt: string;
  thumb: string;
  full: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
}

const thumb = (url: string) => url.replace(/w=\d+/, 'w=200');

/**
 * The example pictures shown inside the frame in the shop photos of a photo or collage frame: one for each
 * photo space of the collage design. The owner uploads them, or types what the picture should show ("child",
 * "couple") and picks free stock photos. Chosen stock photos are copied into the media library like uploads.
 */
export function SamplePhotosPanel({ slots, photos, onChange }: { slots: number; photos: string[]; onChange: (photos: string[]) => void }) {
  const api = useAdminApi();
  const upload = useCatalogueUpload();
  const { showToast } = useToast();
  const { user } = useAuth();
  const authHeader = async () => ({ Authorization: `Bearer ${user ? await user.getIdToken() : ''}` });
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockPhoto[] | null>(null);
  const [searching, setSearching] = useState(false);

  const wanted = Math.max(1, slots);
  const room = () => Math.max(0, wanted - photos.length);

  const addUrls = (urls: string[]) => onChange([...photos, ...urls].slice(0, wanted));

  const uploadFiles = async (files: File[]) => {
    const take = files.slice(0, room() || 1);
    setBusy(`Uploading ${take.length} photo${take.length === 1 ? '' : 's'}…`);
    try {
      const urls: string[] = [];
      for (const file of take) {
        const img = await upload(file, { alt: 'Sample photo', tag: 'sample-photo' });
        urls.push(img.url.replace(/w=\d+/, 'w=2000'));
      }
      // With every space already filled, a new photo replaces the first.
      if (room() === 0) onChange([urls[0]!, ...photos.slice(1)]);
      else addUrls(urls);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    setSearching(true);
    try {
      const r = await api<{ photos: StockPhoto[] }>(`/api/admin/stock-photos?q=${encodeURIComponent(query)}`);
      setResults(r.photos);
      if (r.photos.length === 0) showToast('No photos found. Try other words.', 'error');
    } catch (e) {
      setResults(null);
      showToast(e instanceof Error ? e.message : 'The photo search failed.', 'error');
    } finally {
      setSearching(false);
    }
  };

  /** Copies the chosen stock photos into the media library and puts them in the empty spaces. */
  const useStock = async (picks: StockPhoto[]) => {
    const take = picks.slice(0, room() || 1);
    setBusy(`Adding ${take.length} photo${take.length === 1 ? '' : 's'}…`);
    try {
      const urls: string[] = [];
      for (const p of take) {
        const res = await fetch(`/api/admin/stock-photos/file?u=${encodeURIComponent(p.full)}`, { headers: await authHeader() });
        if (!res.ok) throw new Error('A photo could not be fetched. Choose another.');
        const blob = await res.blob();
        const img = await upload(new File([blob], `stock-${p.id}.jpg`, { type: blob.type || 'image/jpeg' }), { alt: p.alt, tag: 'sample-photo' });
        urls.push(img.url.replace(/w=\d+/, 'w=2000'));
      }
      if (room() === 0) onChange([urls[0]!, ...photos.slice(1)]);
      else addUrls(urls);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The photos could not be added.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const cells = Array.from({ length: Math.min(wanted, 40) }, (_, i) => photos[i] ?? null);
  const missing = Math.max(0, wanted - photos.length);

  return (
    <div className="space-y-3 rounded-xl bg-field/60 p-3 text-xs">
      <div>
        <p className="font-semibold text-ink">
          Sample photos for the shop pictures ({photos.length} of {wanted})
        </p>
        <p className="text-ink/60">
          {wanted > 1 ? `This design has ${wanted} photo spaces. ` : ''}These show inside the frame in the shop photos, marked “Sample photo”.
          {missing > 0 && photos.length > 0 ? ` The ${missing} empty space${missing === 1 ? '' : 's'} repeat the photos you add.` : ''}
          {photos.length === 0 ? ' Until you add some, the shop’s own sample photo is used.' : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {cells.map((url, i) => (
          <div key={i} className="relative h-14 w-14 overflow-hidden rounded-lg border border-line bg-paper">
            {url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(url)} alt={`Sample photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" aria-label={`Remove sample photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute right-0 top-0 h-5 w-5 rounded-bl-lg bg-ink/70 text-[11px] leading-5 text-paper">
                  ×
                </button>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[11px] text-ink/35">{i + 1}</span>
            )}
          </div>
        ))}
        {wanted > 40 && <span className="self-center text-ink/50">+{wanted - 40} more spaces</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void uploadFiles(f); }} />
        <button type="button" disabled={busy !== null} onClick={() => fileInput.current?.click()} className="h-8 rounded-lg border border-line bg-paper px-3 font-semibold text-ink hover:bg-field disabled:opacity-50">
          Upload my photos
        </button>
        <span className="text-ink/45">or</span>
        <input
          aria-label="What should the photo show?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && query.trim().length >= 2 && void search()}
          placeholder="child, couple, family…"
          className="h-8 w-44 rounded-lg border border-line bg-paper px-2 text-xs outline-none focus:border-ink"
        />
        <button type="button" disabled={searching || busy !== null || query.trim().length < 2} onClick={() => void search()} className="h-8 rounded-lg bg-ink px-3 font-semibold text-paper disabled:opacity-40">
          {searching ? 'Searching…' : 'Find free photos'}
        </button>
        {busy && <span className="text-ink/60">{busy}</span>}
      </div>

      {results && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink/60">Tap a photo to add it, or fill every empty space at once.</span>
            <button type="button" disabled={busy !== null} onClick={() => void useStock(results.slice(0, Math.max(1, room() || 1)))} className="h-8 rounded-lg border border-line bg-paper px-3 font-semibold text-ink hover:bg-field disabled:opacity-50">
              Fill {room() || 1} {room() === 1 || room() === 0 ? 'space' : 'spaces'} with these
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {results.map((p) => (
              <button key={p.id} type="button" disabled={busy !== null} title={`${p.alt} — photo by ${p.photographer}`} onClick={() => void useStock([p])} className="overflow-hidden rounded-lg border border-line bg-paper disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.alt} loading="lazy" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
          <p className="text-2xs text-ink/50">
            Free photos from{' '}
            <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">
              Pexels
            </a>
            . Used only as examples in the shop photos.
          </p>
        </div>
      )}
    </div>
  );
}
