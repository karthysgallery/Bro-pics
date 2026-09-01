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
