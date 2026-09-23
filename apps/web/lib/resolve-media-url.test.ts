import { describe, it, expect, vi } from 'vitest';
import { getIdTokenSafe, resolveMediaUrl } from './resolve-media-url';

describe('getIdTokenSafe', () => {
  it('returns null for a null/undefined user', async () => {
    expect(await getIdTokenSafe(null)).toBeNull();
    expect(await getIdTokenSafe(undefined)).toBeNull();
  });

  it('returns null for a user-shaped object with no getIdToken method, without throwing', async () => {
    // The exact shape test files across this repo mock `user` as — a plain
    // { uid } — this must not throw synchronously (a bug this test guards
    // against: `user?.getIdToken().catch(...)` throws before `.catch` is
    // ever reached when getIdToken isn't a function at all).
    await expect(getIdTokenSafe({ uid: 'user_1' } as never)).resolves.toBeNull();
  });

  it('returns the resolved token from a real getIdToken', async () => {
    const user = { getIdToken: vi.fn().mockResolvedValue('tok_123') };
    expect(await getIdTokenSafe(user)).toBe('tok_123');
  });

  it('returns null when getIdToken rejects', async () => {
    const user = { getIdToken: vi.fn().mockRejectedValue(new Error('offline')) };
    expect(await getIdTokenSafe(user)).toBeNull();
  });
});

describe('resolveMediaUrl', () => {
  it('returns the url on a successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://signed.example.com/x.jpg' }) }) as unknown as typeof fetch;
    expect(await resolveMediaUrl('uploads/sess/1/original.jpg')).toBe('https://signed.example.com/x.jpg');
  });

  it('returns null on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await resolveMediaUrl('uploads/sess/1/original.jpg')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
    expect(await resolveMediaUrl('uploads/sess/1/original.jpg')).toBeNull();
  });

  it('passes the idToken as a Bearer header when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x' }) });
    global.fetch = mockFetch as unknown as typeof fetch;
    await resolveMediaUrl('uploads/sess/1/original.jpg', 'tok_abc');
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), { headers: { Authorization: 'Bearer tok_abc' } });
  });
});
