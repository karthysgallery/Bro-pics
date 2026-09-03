'use client';

const STORAGE_KEY = 'bropics_session_id';

/**
 * Anonymous per-browser session id, persisted in localStorage. Scopes
 * uploads/customizations until Phase 4 adds real accounts and reconciles
 * session-owned records to the logged-in user.
 */
export function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

/**
 * Clears the stored session id after a successful reconcileSessionOnLogin
 * call. Without this, the same anonymous session id persists in
 * localStorage indefinitely — since reconciliation reassigns every
 * upload/customization matching that session id to whoever just signed in,
 * a second person signing in later on the same shared browser would
 * otherwise inherit the first user's session-owned records. Calling this
 * lets the next getOrCreateSessionId() start a fresh, unclaimed session.
 */
export function resetSessionId(): void {
  localStorage.removeItem(STORAGE_KEY);
}
