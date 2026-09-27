'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { resolveMediaUrl, getIdTokenSafe } from './resolve-media-url';

/**
 * [FE-03] Resolves a Storage object path to a short-lived, freshly-signed
 * display URL, re-resolving whenever `path` changes. Never caches beyond
 * the current mount — the whole point of storing paths instead of URLs
 * (BE-03/04) is that a fresh one is minted on every read.
 */
export function useMediaUrl(path: string | null | undefined): string | null {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const idToken = await getIdTokenSafe(user);
      const resolved = await resolveMediaUrl(path, idToken);
      if (!cancelled) setUrl(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [path, user]);

  return url;
}
