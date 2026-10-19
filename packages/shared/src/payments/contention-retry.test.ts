import { describe, it, expect, vi } from 'vitest';
import { isContentionError, retryOnContention, serialized } from './contention-retry';

const aborted = () => Object.assign(new Error('10 ABORTED: Transaction lock timeout.'), { code: 10 });
const noSleep = { sleep: vi.fn(async () => {}), random: () => 1 };

describe('retryOnContention', () => {
  it('recognises Firestore contention but not other failures', () => {
    expect(isContentionError(aborted())).toBe(true);
    expect(isContentionError(new Error('10 ABORTED: too much contention on these documents'))).toBe(true);
    expect(isContentionError(new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'))).toBe(true);
    expect(isContentionError(Object.assign(new Error('nope'), { code: 5 }))).toBe(false);
    expect(isContentionError(new Error('Validation failed'))).toBe(false);
    expect(isContentionError(null)).toBe(false);
  });

  it('returns the first success without waiting', async () => {
    const work = vi.fn(async () => 'ok');
    await expect(retryOnContention(work, noSleep)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('retries a contention failure and then succeeds', async () => {
    const work = vi.fn().mockRejectedValueOnce(aborted()).mockRejectedValueOnce(aborted()).mockResolvedValue('done');
    await expect(retryOnContention(work, noSleep)).resolves.toBe('done');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt limit and rethrows the contention error', async () => {
    const work = vi.fn().mockRejectedValue(aborted());
    await expect(retryOnContention(work, { ...noSleep, attempts: 4 })).rejects.toThrow(/ABORTED/);
    expect(work).toHaveBeenCalledTimes(4);
  });

  it('never retries a real error (a bad order must not be repeated)', async () => {
    const work = vi.fn().mockRejectedValue(new Error('Validation failed'));
    await expect(retryOnContention(work, noSleep)).rejects.toThrow('Validation failed');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('waits a bounded, growing, jittered time between attempts', async () => {
    const waits: number[] = [];
    const work = vi.fn().mockRejectedValueOnce(aborted()).mockRejectedValueOnce(aborted()).mockRejectedValueOnce(aborted()).mockResolvedValue('x');
    await retryOnContention(work, { baseDelayMs: 100, maxDelayMs: 250, random: () => 1, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([100, 200, 250]);
  });
});

describe('serialized', () => {
  it('runs work for one key strictly one after another, in order', async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => serialized('k', async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    });
    const results = await Promise.all([job('a', 20), job('b', 5), job('c', 1)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a failure and lets different keys run side by side', async () => {
    const failed = serialized('f', async () => { throw new Error('boom'); });
    await expect(failed).rejects.toThrow('boom');
    await expect(serialized('f', async () => 'next')).resolves.toBe('next');
    const order: string[] = [];
    await Promise.all([
      serialized('x', async () => { await new Promise((r) => setTimeout(r, 15)); order.push('x'); }),
      serialized('y', async () => { order.push('y'); }),
    ]);
    expect(order).toEqual(['y', 'x']);
  });
});
