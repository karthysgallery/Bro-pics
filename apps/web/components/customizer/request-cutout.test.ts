import { describe, it, expect, vi } from 'vitest';
import { requestCutout } from './photo-files';

const ok = () => new Response(JSON.stringify({ uploadId: 'cut_1', widthPx: 1600, heightPx: 2400 }), { status: 200 });
const status = (n: number) => new Response('{}', { status: n });
const ctx = { sessionId: 's1', authToken: null };

describe('requestCutout', () => {
  it('asks again when the site front door times out (504) and gets the finished cut-out', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(504)).mockResolvedValueOnce(ok());
    await expect(requestCutout('up_1', ctx, f as unknown as typeof fetch, 0)).resolves.toMatchObject({ id: 'cut_1' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('asks again after a dropped connection', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(ok());
    await expect(requestCutout('up_1', ctx, f as unknown as typeof fetch, 0)).resolves.toMatchObject({ id: 'cut_1' });
  });

  it('gives up after three tries, and never retries a real answer such as "no people found"', async () => {
    const f = vi.fn().mockResolvedValue(status(502));
    await expect(requestCutout('up_1', ctx, f as unknown as typeof fetch, 0)).rejects.toThrow(/could not be removed/);
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'no_subject' }), { status: 422 }));
    await expect(requestCutout('up_1', ctx, g as unknown as typeof fetch, 0)).rejects.toThrow(/No people/);
    expect(g).toHaveBeenCalledTimes(1);
  });
});
