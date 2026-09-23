interface TokenSource {
  getIdToken?: () => Promise<string>;
}

/**
 * Safely gets a fresh ID token from a Firebase User-shaped object, or null
 * for signed-out/anonymous callers — and for test doubles that mock `user`
 * as a plain `{ uid }` with no `getIdToken` method. `user?.getIdToken()`
 * alone would throw synchronously in that case (a TypeError on a
 * non-function call happens before `.catch()` is ever reached), not just
 * on a rejected promise, so this needs a real try/catch around the call
 * itself.
 */
export async function getIdTokenSafe(user: TokenSource | null | undefined): Promise<string | null> {
  if (!user || typeof user.getIdToken !== 'function') return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Client-side helper that turns a Storage object path into a short-lived,
 * freshly-signed display URL via GET /api/media/url. Never cache the
 * result beyond the current render — the whole point of storing paths
 * instead of URLs is that a fresh one is minted on every read.
 */
export async function resolveMediaUrl(path: string, idToken?: string | null): Promise<string | null> {
  try {
    const res = await fetch(`/api/media/url?path=${encodeURIComponent(path)}`, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}
