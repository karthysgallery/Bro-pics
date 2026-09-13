import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateSessionId } from './session-id';

describe('getOrCreateSessionId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists a new session id on first call', () => {
    const id = getOrCreateSessionId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem('bropics_session_id')).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(second).toBe(first);
  });

  it('reuses an id already present in localStorage', () => {
    localStorage.setItem('bropics_session_id', 'existing-id-123');
    expect(getOrCreateSessionId()).toBe('existing-id-123');
  });
});
