'use client';

import { useEffect, useRef, useState } from 'react';

export type ImageStatus = 'loading' | 'loaded' | 'error';

export interface ImageCache {
  get(src: string): HTMLImageElement | undefined;
  status(src: string): ImageStatus | undefined;
  /** True when every one of `srcs` has finished loading (an export must not silently drop a photo). */
  allLoaded(srcs: readonly string[]): boolean;
  /** Changes whenever an image finishes loading, so drawing can be re-run. */
  version: number;
}

/**
 * Loads every `src` once and keeps the decoded images for the canvas. Sources
 * are same-origin or blob URLs (see asset-src.ts and photo-sources.ts), so no
 * CORS mode is needed and the canvas stays exportable.
 */
export function useImageCache(srcs: readonly string[]): ImageCache {
  const entries = useRef(new Map<string, { img: HTMLImageElement; status: ImageStatus }>());
  // Lives for the whole component, not one effect run: an image that finishes
  // after the list changed must still trigger a redraw.
  const mounted = useRef(true);
  const [version, setVersion] = useState(0);
  const key = [...new Set(srcs)].sort().join('\n');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const wanted = new Set(key ? key.split('\n') : []);
    for (const src of wanted) {
      if (entries.current.has(src)) continue;
      const img = new Image();
      img.decoding = 'async';
      const entry = { img, status: 'loading' as ImageStatus };
      entries.current.set(src, entry);
      img.onload = () => {
        entry.status = 'loaded';
        if (mounted.current) setVersion((v) => v + 1);
      };
      img.onerror = () => {
        entry.status = 'error';
        if (mounted.current) setVersion((v) => v + 1);
      };
      img.src = src;
    }
    // Let replaced photos be garbage-collected.
    for (const src of [...entries.current.keys()]) {
      if (!wanted.has(src)) entries.current.delete(src);
    }
  }, [key]);

  return {
    get: (src) => {
      const e = entries.current.get(src);
      return e && e.status === 'loaded' ? e.img : undefined;
    },
    status: (src) => entries.current.get(src)?.status,
    allLoaded: (list) => list.every((src) => entries.current.get(src)?.status === 'loaded'),
    version,
  };
}
