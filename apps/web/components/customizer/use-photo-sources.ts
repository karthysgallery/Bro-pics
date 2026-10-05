'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_PHOTO_SIDE } from './photo-files';

export type PhotoSourceStatus = 'loading' | 'ready' | 'error';

export interface PhotoSources {
  /** blob: URL to draw an asset from, once it is available. */
  srcFor(assetId: string): string | undefined;
  status(assetId: string): PhotoSourceStatus | undefined;
  /** A local copy made from the customer's own file (also used for the uploaded id afterwards). */
  register(assetId: string, src: string): void;
  /** Fetch saved photos (a restored draft, a cart line being edited) from this app's own image route. */
  ensure(assetIds: readonly string[]): void;
  /** Bumps when a source becomes available or fails, to re-run drawing. */
  version: number;
}

export interface PhotoSourceContext {
  sessionId: () => string;
  authToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

/**
 * Where each photo in the design is drawn from. Kept OUT of the personalization
 * state on purpose: blob URLs die with the page, and the state is what gets
 * saved to drafts and cart lines. Every URL made here is revoked on unmount.
 */
export function usePhotoSources(ctx: PhotoSourceContext): PhotoSources {
  const entries = useRef(new Map<string, { status: PhotoSourceStatus; src?: string }>());
  const owned = useRef(new Set<string>());
  const mounted = useRef(true);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => {
    if (mounted.current) setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const urls = owned.current;
    return () => {
      mounted.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const register = useCallback(
    (assetId: string, src: string) => {
      entries.current.set(assetId, { status: 'ready', src });
      if (src.startsWith('blob:')) owned.current.add(src);
      bump();
    },
    [bump]
  );

  const ensure = useCallback(
    (assetIds: readonly string[]) => {
      for (const id of assetIds) {
        if (entries.current.has(id) || id.startsWith('local:')) continue;
        entries.current.set(id, { status: 'loading' });
        (async () => {
          try {
            const { sessionId, authToken, fetchImpl = fetch } = ctxRef.current;
            const token = await authToken().catch(() => null);
            const res = await fetchImpl(`/api/uploads/${encodeURIComponent(id)}/image?w=${EDITOR_PHOTO_SIDE}`, {
              headers: { 'X-Session-Id': sessionId(), ...(token && { Authorization: `Bearer ${token}` }) },
            });
            if (!res.ok) throw new Error(String(res.status));
            const src = URL.createObjectURL(await res.blob());
            owned.current.add(src);
            if (!mounted.current) {
              URL.revokeObjectURL(src);
              return;
            }
            entries.current.set(id, { status: 'ready', src });
          } catch {
            entries.current.set(id, { status: 'error' });
          }
          bump();
        })();
      }
    },
    [bump]
  );

  return useMemo(
    () => ({
      srcFor: (id: string) => entries.current.get(id)?.src,
      status: (id: string) => entries.current.get(id)?.status,
      register,
      ensure,
      version,
    }),
    [register, ensure, version]
  );
}
