import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMediaUrl } from './use-media-url';

vi.mock('./auth-context', () => ({
  useAuth: vi.fn(() => ({ user: null, loading: false })),
}));

describe('useMediaUrl', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('resolves a path to a fresh display URL', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://signed.example.com/fresh.jpg' }),
    } as Response);

    const { result } = renderHook(() => useMediaUrl('uploads/sess_1/photo.jpg'));

    await waitFor(() => expect(result.current).toBe('https://signed.example.com/fresh.jpg'));
  });

  it('returns null for a null/undefined path without calling fetch', () => {
    const { result } = renderHook(() => useMediaUrl(null));
    expect(result.current).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-resolves when the path changes', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://signed.example.com/a.jpg' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://signed.example.com/b.jpg' }) } as Response);

    const { result, rerender } = renderHook(({ path }: { path: string }) => useMediaUrl(path), {
      initialProps: { path: 'uploads/sess_1/a.jpg' },
    });
    await waitFor(() => expect(result.current).toBe('https://signed.example.com/a.jpg'));

    rerender({ path: 'uploads/sess_1/b.jpg' });
    await waitFor(() => expect(result.current).toBe('https://signed.example.com/b.jpg'));
  });
});
